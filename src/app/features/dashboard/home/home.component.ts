import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SimulationService, SimulationData } from '../../../core/services/simulation.service';
import * as XLSX from 'xlsx';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  private simulationService = inject(SimulationService);
  private authService = inject(AuthService);
  private router = inject(Router);

  recentSimulations: SimulationData[] = [];
  totalSimulations = 0;
  completedSimulations = 0;
  averagePMT = 0;
  averageTCEA = 0;
  currentUserId: number | null = null;

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      if (user && user.id) {
        this.currentUserId = user.id;
        this.loadDashboardData();
      }
    });
  }

  loadDashboardData() {
    this.simulationService.getMyLoans().subscribe({
      next: (simulations) => {
        this.totalSimulations = simulations.length;
        this.completedSimulations = simulations.length;

        // Sort by date descending and take top 5
        this.recentSimulations = simulations
          .sort((a, b) => {
            const dateA = new Date(a.createdAt || a.disbursementDate || 0).getTime();
            const dateB = new Date(b.createdAt || b.disbursementDate || 0).getTime();
            return dateB - dateA;
          })
          .slice(0, 5);

        this.calculateMetrics(simulations);
      },
      error: (error) => {
        console.error('Error loading dashboard data', error);
      }
    });
  }

  calculateMetrics(simulations: SimulationData[]) {
    if (simulations.length === 0) {
      this.averagePMT = 0;
      this.averageTCEA = 0;
      return;
    }

    let totalPMT = 0;
    let totalTCEA = 0;
    let validCount = 0;

    simulations.forEach(sim => {
      try {
        const pmt = this.calculateApproximatePMT(sim);
        const tcea = this.calculateApproximateTCEA(sim, pmt);



        if (pmt > 0) {
          totalPMT += pmt;
          totalTCEA += tcea;
          validCount++;
        } else {
          console.warn('Skipping sim for stats (invalid PMT):', sim.name, pmt, tcea);
        }
      } catch (e) {
        console.warn('Could not calculate metrics for sim:', sim.id, e);
      }
    });

    this.averagePMT = validCount > 0 ? totalPMT / validCount : 0;
    this.averageTCEA = validCount > 0 ? totalTCEA / validCount : 0;

    console.log('Stats calculated:', { total: simulations.length, valid: validCount, avgPMT: this.averagePMT, avgTCEA: this.averageTCEA });
  }

  private calculateApproximatePMT(sim: SimulationData): number {
    const annualRate = this.parseNumber(sim.annualRate);
    // Always divide by 100 as data comes as percentage (e.g. 15 for 15%, 0.03 for 0.03%)
    const rateDecimal = annualRate / 100;

    let monthlyRate = 0;
    if (sim.interestType === 'NOMINAL') {
      monthlyRate = rateDecimal / 12;
    } else {
      monthlyRate = Math.pow(1 + rateDecimal, 1 / 12) - 1;
    }

    const n = sim.totalMonths;
    const loanAmount = this.parseNumber(sim.loanAmount);
    const initialFee = this.parseNumber(sim.initialFeeAmount);
    const bbp = this.parseNumber(sim.bbpAmount);
    const financedCapital = this.parseNumber(sim.financedCapital) || (loanAmount - initialFee - bbp);

    const insurancePct = this.parseNumber(sim.insurancePercentage);
    // Always divide by 100 as data comes as percentage
    const insuranceDecimal = insurancePct / 100;

    const rateForPMT = monthlyRate + insuranceDecimal;

    let basePMT = 0;
    if (rateForPMT > 0) {
      basePMT = financedCapital * (rateForPMT * Math.pow(1 + rateForPMT, n)) / (Math.pow(1 + rateForPMT, n) - 1);
    } else {
      basePMT = financedCapital / n;
    }

    const fixedInsurance = this.parseNumber(sim.fixedInsurance);
    const periodicCommission = this.parseNumber(sim.periodicCommission);

    const periodicCost = fixedInsurance + periodicCommission;

    return basePMT + periodicCost;
  }

  private calculateApproximateTCEA(sim: SimulationData, pmt: number): number {
    const loanAmount = this.parseNumber(sim.loanAmount);
    const initialFee = this.parseNumber(sim.initialFeeAmount);
    const bbp = this.parseNumber(sim.bbpAmount);
    const initialCommission = this.parseNumber(sim.initialCommission);
    const finalCommission = this.parseNumber(sim.finalCommission);

    const financedCapital = this.parseNumber(sim.financedCapital) || (loanAmount - initialFee - bbp);
    const initialFlow = financedCapital - initialCommission;

    const flows = [initialFlow];
    for (let i = 0; i < sim.totalMonths; i++) {
      flows.push(-pmt);
    }
    flows[flows.length - 1] -= finalCommission;

    const irr = this.calculateIRR(flows, 0.01);
    if (irr === null) return 0;

    return (Math.pow(1 + irr, 12) - 1) * 100;
  }

  private calculateIRR(values: number[], guess: number = 0.01): number | null {
    const maxIter = 100;
    const tol = 1e-6;
    let x0 = guess;

    for (let i = 0; i < maxIter; i++) {
      let fValue = 0;
      let fDerivative = 0;

      for (let j = 0; j < values.length; j++) {
        fValue += values[j] / Math.pow(1 + x0, j);
        fDerivative += -j * values[j] / Math.pow(1 + x0, j + 1);
      }

      if (Math.abs(fDerivative) < tol) return null;

      const x1 = x0 - fValue / fDerivative;

      if (Math.abs(x1 - x0) < tol) return x1;

      x0 = x1;
    }
    return null;
  }

  private parseNumber(val: any): number {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleanVal = val.replace(/,/g, '');
      const num = parseFloat(cleanVal);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }

  viewSimulation(id: string | undefined) {
    if (id) {
      this.router.navigate(['/simulation', id]);
    }
  }

  importSimulation(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        let simulationData: SimulationData | null = null;

        if (workbook.Sheets['Datos']) {
          const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets['Datos']);
          if (jsonData.length > 0) {
            const importedData: any = jsonData[0];
            simulationData = {
              name: importedData.name || 'Simulación Importada',
              currency: importedData.currency || 'PEN',
              loanAmount: this.parseNumber(importedData.loanAmount),
              bbpAmount: this.parseNumber(importedData.bbpAmount),
              initialFeePercentage: this.parseNumber(importedData.initialFeePercentage),
              initialFeeAmount: this.parseNumber(importedData.initialFeeAmount),
              financedCapital: this.parseNumber(importedData.financedCapital),
              exchangeRate: this.parseNumber(importedData.exchangeRate),
              interestType: importedData.interestType || 'EFFECTIVE',
              annualRate: this.parseNumber(importedData.annualRate),
              capitalizationPeriod: importedData.capitalizationPeriod || 'ANNUALLY',
              paymentFrequency: importedData.paymentFrequency || 'MONTHLY',
              totalMonths: this.parseNumber(importedData.totalMonths),
              gracePeriodType: importedData.gracePeriodType || 'NONE',
              gracePeriodMonths: this.parseNumber(importedData.gracePeriodMonths),
              insurancePercentage: this.parseNumber(importedData.insurancePercentage),
              fixedInsurance: this.parseNumber(importedData.fixedInsurance),
              initialCommission: this.parseNumber(importedData.initialCommission),
              periodicCommission: this.parseNumber(importedData.periodicCommission),
              finalCommission: this.parseNumber(importedData.finalCommission),
              disbursementDate: importedData.disbursementDate || new Date().toISOString().split('T')[0],
              discountRate: this.parseNumber(importedData.discountRate),
              userId: this.currentUserId || undefined
            };
          }
        }

        if (!simulationData && workbook.Sheets['Parámetros']) {
          const paramsSheet = workbook.Sheets['Parámetros'];
          const paramsData = XLSX.utils.sheet_to_json(paramsSheet, { header: 1 }) as any[][];

          const paramsMap = new Map<string, any>();
          paramsData.forEach(row => {
            if (row.length >= 2) {
              paramsMap.set(row[0], row[1]);
            }
          });

          if (paramsMap.size > 0) {
            simulationData = this.mapParamsToSimulationData(paramsMap);
          }
        }

        if (!simulationData) {
          alert('El archivo no tiene el formato correcto (falta hoja "Datos" o "Parámetros").');
          event.target.value = '';
          return;
        }

        // Validate required fields
        if (!simulationData.loanAmount || !simulationData.totalMonths) {
          alert('Faltan datos requeridos en el archivo.');
          event.target.value = '';
          return;
        }

        this.simulationService.saveSimulation(simulationData).subscribe({
          next: (savedSim) => {
            alert('Simulación importada correctamente.');
            this.loadDashboardData();
            event.target.value = '';
          },
          error: (err) => {
            console.error('Error importing simulation', err);
            const msg = err.error?.message || err.message || 'Error desconocido';
            alert(`Error al importar la simulación: ${msg}`);
            event.target.value = '';
          }
        });

      } catch (error) {
        console.error('Error reading file', error);
        alert('Error al leer el archivo.');
        event.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  private mapParamsToSimulationData(params: Map<string, any>): SimulationData {
    const parsePct = (val: string) => {
      if (!val) return 0;
      const clean = val.toString().replace('%', '').trim();
      return parseFloat(clean);
    };

    const parseInterest = (val: string) => {
      if (!val) return { rate: 0, type: 'EFFECTIVE' };
      const parts = val.toString().split('%');
      const rate = parseFloat(parts[0]);
      const type = val.includes('NOMINAL') ? 'NOMINAL' : 'EFFECTIVE';
      return { rate, type };
    };

    const parseGrace = (val: string) => {
      if (!val || val === 'Ninguno') return { type: 'NONE', months: 0 };
      const type = val.includes('Parcial') ? 'PARTIAL' : (val.includes('Total') ? 'TOTAL' : 'NONE');
      const match = val.match(/\((\d+) meses\)/);
      const months = match ? parseInt(match[1]) : 0;
      return { type, months };
    };

    const interestInfo = parseInterest(params.get('Tasa de Interés'));
    const graceInfo = parseGrace(params.get('Periodo de Gracia'));

    return {
      name: params.get('Nombre') || 'Simulación Importada (Legacy)',
      currency: params.get('Moneda') || 'PEN',
      loanAmount: this.parseNumber(params.get('Monto del Préstamo')),
      financedCapital: this.parseNumber(params.get('Capital Financiado')),
      bbpAmount: this.parseNumber(params.get('Bono Buen Pagador')),
      initialFeeAmount: this.parseNumber(params.get('Cuota Inicial')),
      initialFeePercentage: parsePct(params.get('Porcentaje Cuota Inicial')),
      annualRate: interestInfo.rate / 100,
      interestType: interestInfo.type as any,
      capitalizationPeriod: params.get('Periodo de Capitalización') || 'ANNUALLY',
      totalMonths: this.parseNumber(params.get('Plazo (meses)')),
      paymentFrequency: params.get('Frecuencia de Pago') || 'MONTHLY',
      gracePeriodType: graceInfo.type as any,
      gracePeriodMonths: graceInfo.months,
      insurancePercentage: parsePct(params.get('Seguro Desgravamen')) / 100,
      fixedInsurance: this.parseNumber(params.get('Seguro Fijo')),
      initialCommission: this.parseNumber(params.get('Comisión Inicial')),
      periodicCommission: this.parseNumber(params.get('Comisión Periódica')),
      finalCommission: this.parseNumber(params.get('Comisión Final')),
      disbursementDate: params.get('Fecha de Desembolso') || new Date().toISOString().split('T')[0],
      discountRate: parsePct(params.get('Tasa de Descuento')) / 100,
      exchangeRate: this.parseNumber(params.get('Tipo de Cambio')),
      userId: this.currentUserId || undefined
    };
  }
}
