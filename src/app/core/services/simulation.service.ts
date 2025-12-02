import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment.prod';

export interface SimulationData {
  id?: string;
  userId?: number;
  name: string;
  currency: 'PEN' | 'USD';
  loanAmount: number;
  bbpAmount: number;
  initialFeePercentage: number;
  initialFeeAmount: number;
  financedCapital?: number;
  exchangeRate: number;
  interestType: 'EFFECTIVE' | 'NOMINAL';
  annualRate: number;
  capitalizationPeriod: 'DAILY' | 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY';
  paymentFrequency: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY';
  totalMonths: number;
  gracePeriodType: 'NONE' | 'PARTIAL' | 'TOTAL';
  gracePeriodMonths: number;
  insurancePercentage: number;
  fixedInsurance: number;
  initialCommission: number;
  periodicCommission: number;
  finalCommission: number;
  disbursementDate: string;
  discountRate: number;
  createdAt?: string;
}

export interface AmortizationRow {
  period: number;
  date: string;
  initialBalance: number;
  interest: number;
  amortization: number;
  insurance: number;
  commissions: number;
  totalInstallment: number;
  finalBalance: number;
}

export interface SimulationResult {
  summary: {
    currency: 'PEN' | 'USD';
    amount: number;
    term: number;
    tea: number;
    bbp: number;
    van: number;
    tir: number;
    tcea: number;
    approxInstallment: number;
  };
  table: AmortizationRow[];
  indicators: {
    totalInterests: number;
    totalInsurance: number;
    totalCommissions: number;
    totalCost: number;
    averageInstallment: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class SimulationService {
  private apiUrl = environment.apiUrl + '/loans';
  private simulationsSubject = new BehaviorSubject<SimulationData[]>([]);

  constructor(private http: HttpClient) { }

  // =================================================================
  //  1. LECTURA (GET): Backend (Decimal) -> UI (Porcentaje Entero)
  // =================================================================

  getMyLoans(): Observable<SimulationData[]> {
    return this.http.get<SimulationData[]>(`${this.apiUrl}/my-loans`).pipe(
      map(simulations => simulations.map(sim => this.transformToUI(sim))),
      tap(simulations => this.simulationsSubject.next(simulations))
    );
  }

  getSimulations(): Observable<SimulationData[]> {
    return this.simulationsSubject.asObservable();
  }

  getSimulationById(id: string): Observable<SimulationData> {
    return this.http.get<SimulationData>(`${this.apiUrl}/${id}`).pipe(
      map(sim => this.transformToUI(sim))
    );
  }

  // =================================================================
  //  2. ESCRITURA (POST): UI (Porcentaje Entero) -> Backend (Decimal)
  // =================================================================

  saveSimulation(data: SimulationData): Observable<SimulationData> {
    const payload = this.transformToAPI(data);

    return this.http.post<any>(`${this.apiUrl}/simulate`, payload).pipe(
      tap(() => this.getMyLoans().subscribe()),
      // Retornamos 'data' original para que la UI no se altere
      map(() => data)
    );
  }

  deleteSimulation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  simulateCredit(data: SimulationData): Observable<SimulationResult> {
    const payload = this.transformToAPI(data);

    return this.http.post<SimulationResult>(`${this.apiUrl}/simulate`, payload).pipe(
      map(result => this.recalculateIndicators(data, result))
    );
  }

  // =================================================================
  //  LOGICA DE TRANSFORMACIÓN (ADAPTERS) - CORREGIDA
  // =================================================================

  /**
   * Convierte datos de la API a formato Visual.
   * Se mantiene la heurística aquí para leer datos viejos mixtos.
   */
  private transformToUI(data: SimulationData): SimulationData {
    const uiData = { ...data };

    // Si viene en decimal (<=1), lo pasamos a porcentaje visual (x100)
    // Ej: 0.15 -> 15 | 0.005 -> 0.5
    if (uiData.annualRate <= 1 && uiData.annualRate > 0) uiData.annualRate *= 100;
    if (uiData.discountRate <= 1 && uiData.discountRate > 0) uiData.discountRate *= 100;
    if (uiData.initialFeePercentage <= 1 && uiData.initialFeePercentage > 0) uiData.initialFeePercentage *= 100;
    if (uiData.insurancePercentage <= 1 && uiData.insurancePercentage > 0) uiData.insurancePercentage *= 100;

    return uiData;
  }

  /**
   * Convierte datos Visuales a formato API.
   * CAMBIO IMPORTANTE: Eliminamos el "if > 1". 
   * Asumimos que el input SIEMPRE es porcentaje y SIEMPRE dividimos.
   */
  private transformToAPI(data: SimulationData): SimulationData {
    const apiData = { ...data };

    // SIEMPRE dividimos entre 100.
    // 15 -> 0.15
    // 0.5 -> 0.005 (0.5%)

    if (apiData.annualRate) apiData.annualRate = apiData.annualRate / 100;
    if (apiData.discountRate) apiData.discountRate = apiData.discountRate / 100;
    if (apiData.initialFeePercentage) apiData.initialFeePercentage = apiData.initialFeePercentage / 100;
    if (apiData.insurancePercentage) apiData.insurancePercentage = apiData.insurancePercentage / 100;

    return apiData;
  }

  // =================================================================
  //  CÁLCULOS LOCALES
  // =================================================================

  recalculateIndicators(uiData: SimulationData, result: any): SimulationResult {
    // Usamos transformToAPI para obtener la versión matemática (0.15, 0.005)
    const mathData = this.transformToAPI(uiData);

    if (!result.table && result.flows) {
      const disbursementDate = new Date(uiData.disbursementDate || new Date());
      result.table = result.flows.map((f: any) => {
        const date = new Date(disbursementDate);
        date.setMonth(date.getMonth() + f.periodNumber);
        return {
          period: f.periodNumber,
          date: date.toISOString().split('T')[0],
          initialBalance: this.parseNumber(f.initialBalance),
          interest: this.parseNumber(f.interest),
          amortization: this.parseNumber(f.amortization),
          insurance: this.parseNumber(f.insuranceAmount) + this.parseNumber(f.fixedInsuranceAmount),
          commissions: this.parseNumber(f.commissionAmount),
          totalInstallment: this.parseNumber(f.totalPayment),
          finalBalance: this.parseNumber(f.finalBalance)
        };
      });

      if (!result.summary) {
        const table = result.table;
        const totalInterests = table.reduce((acc: number, row: any) => acc + row.interest, 0);
        const totalInsurance = table.reduce((acc: number, row: any) => acc + row.insurance, 0);
        const totalCommissions = table.reduce((acc: number, row: any) => acc + row.commissions, 0);
        const totalCost = table.reduce((acc: number, row: any) => acc + row.totalInstallment, 0);

        result.indicators = {
          totalInterests,
          totalInsurance,
          totalCommissions,
          totalCost,
          averageInstallment: totalCost / (table.length || 1)
        };

        result.summary = {
          currency: uiData.currency,
          amount: this.parseNumber(uiData.loanAmount),
          term: uiData.totalMonths,
          // Mostramos la versión UI (ej: 0.5) en el resumen
          tea: this.parseNumber(uiData.annualRate),
          bbp: this.parseNumber(uiData.bbpAmount),
          van: 0,
          tir: 0,
          tcea: 0,
          approxInstallment: table.find((r: any) => r.totalInstallment > 0)?.totalInstallment || 0
        };
      }
    }

    const table = result.table;
    if (!table || table.length === 0) return result;

    const flows = table.map((r: any) => {
      const val = r.totalInstallment !== undefined ? r.totalInstallment : (r.totalPayment || 0);
      return -this.parseNumber(val);
    });

    const loanAmount = this.parseNumber(uiData.loanAmount);
    const initialFeeAmount = this.parseNumber(uiData.initialFeeAmount);
    const bbpAmount = this.parseNumber(uiData.bbpAmount);
    const initialCommission = this.parseNumber(uiData.initialCommission);

    const financedCapital = this.parseNumber(uiData.financedCapital) || (loanAmount - initialFeeAmount - bbpAmount);
    const initialFlow = financedCapital - initialCommission;

    flows.unshift(initialFlow);

    // Calculamos TIR y TCEA (Decimal)
    const irr = this.calculateIRR(flows, 0.01);
    const tceaDecimal = irr !== null ? (Math.pow(1 + irr, 12) - 1) : 0;

    // TCEA Visual (Multiplicamos por 100 para mostrar %)
    const tceaVisual = tceaDecimal * 100;

    // Calculamos VAN usando la tasa matemática (mathData ya tiene la división hecha)
    // mathData.discountRate será 0.005 si el usuario puso 0.5
    const discountRateInput = this.parseNumber(mathData.discountRate);
    const discountRateMonthly = Math.pow(1 + discountRateInput, 1 / 12) - 1;

    const van = this.calculateVAN(flows, discountRateMonthly);

    console.log('Recalculate Debug:', { irr, tceaVisual, van, discountRateInput });

    if (result.summary) {
      result.summary.van = van;
      result.summary.tir = tceaVisual;
      result.summary.tcea = tceaVisual;
    }

    return result;
  }

  private parseNumber(value: any): number {
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return typeof value === 'number' && !isNaN(value) ? value : 0;
  }

  private calculateIRR(flows: number[], guess: number): number | null {
    const MAX_ITERATIONS = 1000;
    const FINANCIAL_PRECISION = 0.000001;
    let x0 = guess;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      let fValue = 0;
      let fDerivative = 0;
      for (let j = 0; j < flows.length; j++) {
        fValue += flows[j] / Math.pow(1 + x0, j);
        fDerivative += (-flows[j] * j) / Math.pow(1 + x0, j + 1);
      }
      if (fDerivative === 0) return null;
      const x1 = x0 - fValue / fDerivative;
      if (Math.abs(x1 - x0) < FINANCIAL_PRECISION) return x1;
      x0 = x1;
    }
    return null;
  }

  private calculateVAN(flows: number[], rate: number): number {
    return flows.reduce((acc, flow, i) => acc + flow / Math.pow(1 + rate, i), 0);
  }
}