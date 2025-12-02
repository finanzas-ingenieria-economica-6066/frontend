import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SimulationService, SimulationData, SimulationResult } from '../../../core/services/simulation.service';
import { ResultsComponent } from '../results/results.component';
import { AuthService } from '../../../core/services/auth.service';
import { ExportService } from '../../../core/services/export.service';

@Component({
    selector: 'app-simulation-details',
    standalone: true,
    imports: [CommonModule, RouterLink, ResultsComponent],
    templateUrl: './simulation-details.component.html',
    styleUrl: './simulation-details.component.scss'
})
export class SimulationDetailsComponent implements OnInit {
    simulation: SimulationData | undefined;
    simulationResult: SimulationResult | undefined;
    isLoading = true;

    errorMessage: string | null = null;
    currentUserId: number | null = null;

    constructor(
        private route: ActivatedRoute,
        private simulationService: SimulationService,
        private authService: AuthService,
        private exportService: ExportService
    ) { }

    ngOnInit(): void {
        this.authService.currentUser$.subscribe(user => {
            if (user && user.id) {
                this.currentUserId = user.id;
            }
        });

        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.loadSimulation(id);
        }
    }

    loadSimulation(id: string) {
        this.isLoading = true;
        this.errorMessage = null;
        console.log('Loading simulation with ID:', id);
        this.simulationService.getSimulationById(id).subscribe({
            next: (data: any) => {
                console.log('Simulation data received:', data);
                this.simulation = data;

                if (data.flows) {
                    this.simulationResult = this.mapFlowsToResult(data);

                    this.simulationResult = this.simulationService.recalculateIndicators(data, this.simulationResult);
                    this.isLoading = false;
                } else if (data.table && data.summary && data.indicators) {

                    this.simulationResult = this.simulationService.recalculateIndicators(data, data);
                    this.isLoading = false;
                } else if (data.results) {
                    this.simulationResult = this.simulationService.recalculateIndicators(data, data.results);
                    this.isLoading = false;
                } else {
                    this.calculateResults(data);
                }
            },
            error: (err) => {
                console.error('Error loading simulation', err);
                this.errorMessage = 'Error al cargar la simulación.';
                this.isLoading = false;
            }
        });
    }

    private mapFlowsToResult(data: any): SimulationResult {
        const disbursementDate = new Date(data.disbursementDate || new Date());

        const table = data.flows.map((f: any) => {
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

        const totalInterests = table.reduce((acc: number, row: any) => acc + row.interest, 0);
        const totalInsurance = table.reduce((acc: number, row: any) => acc + row.insurance, 0);
        const totalCommissions = table.reduce((acc: number, row: any) => acc + row.commissions, 0);
        const totalCost = table.reduce((acc: number, row: any) => acc + row.totalInstallment, 0);

        return {
            summary: {
                currency: data.currency,
                amount: this.parseNumber(data.loanAmount),
                term: data.totalMonths,
                tea: this.parseNumber(data.annualRate),
                bbp: this.parseNumber(data.bbpAmount),
                van: 0,
                tir: 0,
                tcea: 0,
                approxInstallment: table.find((r: any) => r.totalInstallment > 0)?.totalInstallment || 0
            },
            table: table,
            indicators: {
                totalInterests,
                totalInsurance,
                totalCommissions,
                totalCost,
                averageInstallment: totalCost / (table.length || 1)
            }
        };
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

    translatePeriod(period: string): string {
        const map: { [key: string]: string } = {
            'ANNUALLY': 'Anual',
            'SEMI_ANNUALLY': 'Semestral',
            'QUARTERLY': 'Trimestral',
            'MONTHLY': 'Mensual',
            'DAILY': 'Diario'
        };
        return map[period] || period;
    }

    translateFrequency(freq: string): string {
        const map: { [key: string]: string } = {
            'MONTHLY': 'Mensual',
            'QUARTERLY': 'Trimestral',
            'SEMI_ANNUALLY': 'Semestral',
            'ANNUALLY': 'Anual'
        };
        return map[freq] || freq;
    }

    calculateResults(data: SimulationData) {

        const requestData: any = { ...data };
        delete requestData.id;
        delete requestData.createdAt;

        this.simulationService.simulateCredit(requestData).subscribe({
            next: (result) => {
                this.simulationResult = result;
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error calculating results', err);
                this.errorMessage = 'Error al calcular los resultados: ' + (err.error?.message || err.message || JSON.stringify(err));
                this.isLoading = false;
            }
        });
    }

    exportToExcel() {
        if (!this.simulation) {
            alert('No se han cargado los datos de la simulación.');
            return;
        }

        try {
            this.exportService.exportSimulation(this.simulation, this.simulationResult);
        } catch (error) {
            alert('Ocurrió un error al exportar: ' + error);
        }
    }
}
