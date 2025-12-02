import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions, ChartType } from 'chart.js';
import { SimulationService, SimulationData, SimulationResult } from '../../core/services/simulation.service';

@Component({
    selector: 'app-graficos',
    standalone: true,
    imports: [CommonModule, FormsModule, BaseChartDirective],
    templateUrl: './graficos.component.html',
    styleUrls: ['./graficos.component.scss']
})
export class GraficosComponent implements OnInit {
    @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

    simulations: SimulationData[] = [];
    selectedSimulationId: string = '';
    selectedSimulation: SimulationData | null = null;
    currentResult: SimulationResult | null = null;
    isLoading = false;

    public lineChartData: ChartConfiguration<'line'>['data'] = {
        labels: [],
        datasets: [
            {
                data: [],
                label: 'VAN (Valor Actual Neto)',
                fill: false,
                tension: 0.1,
                borderColor: 'black',
                backgroundColor: 'rgba(0,0,0,0.1)',
                pointBackgroundColor: 'black',
                pointBorderColor: 'black',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'black'
            }
        ]
    };

    public lineChartOptions: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'TIR',
                    font: { weight: 'bold' }
                },
                grid: {
                    color: (context) => context.tick?.value === 0 ? 'black' : 'rgba(0,0,0,0.1)',
                    lineWidth: (context) => context.tick?.value === 0 ? 2 : 1,
                },
                ticks: {
                    callback: function (val, index) {
                        return index % 5 === 0 ? this.getLabelForValue(val as number) : '';
                    }
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'VAN',
                    font: { weight: 'bold' }
                },
                grid: {
                    color: (context) => context.tick?.value === 0 ? 'black' : 'rgba(0,0,0,0.1)',
                    lineWidth: (context) => context.tick?.value === 0 ? 2 : 1,
                }
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: (context) => `VAN: ${(context.parsed.y || 0).toFixed(2)}`
                }
            },
            legend: {
                display: false
            }
        }
    };

    public lineChartLegend = true;

    constructor(private simulationService: SimulationService) { }

    ngOnInit(): void {
        this.loadSimulations();
    }

    loadSimulations() {
        this.simulationService.getMyLoans().subscribe({
            next: (data) => {
                this.simulations = data;
            },
            error: (err) => console.error('Error loading simulations', err)
        });
    }

    onSimulationChange() {
        console.log('Selection changed. ID:', this.selectedSimulationId);
        if (!this.selectedSimulationId) return;

        this.selectedSimulation = this.simulations.find(s => String(s.id) === String(this.selectedSimulationId)) || null;
        console.log('Found simulation:', this.selectedSimulation);

        if (this.selectedSimulation) {
            this.generateChartData(this.selectedSimulation);
        }
    }

    generateChartData(simulation: SimulationData) {
        this.isLoading = true;
        if (!simulation.id) {
            console.error('Simulation ID missing');
            this.isLoading = false;
            return;
        }

        this.simulationService.getSimulationById(simulation.id).subscribe({
            next: (data: any) => {
                console.log('Simulation data received:', data);
                let result: SimulationResult | null = null;

                if (data.flows) {
                    result = this.mapFlowsToResult(data);
                    result = this.simulationService.recalculateIndicators(data, result);
                } else if (data.table) {
                    result = this.simulationService.recalculateIndicators(data, data);
                } else if (data.results) {
                    result = this.simulationService.recalculateIndicators(data, data.results);
                }

                if (result) {
                    this.currentResult = result;
                    this.calculateVanCurve(simulation, result);
                } else {
                    console.warn('No results found in simulation data, attempting calculation...');
                    const requestData: any = { ...data };
                    delete requestData.id;
                    delete requestData.createdAt;

                    this.simulationService.simulateCredit(requestData).subscribe({
                        next: (res) => {
                            this.currentResult = res;
                            this.calculateVanCurve(simulation, res);
                            this.isLoading = false;
                        },
                        error: (err) => {
                            console.error('Error calculating results', err);
                            this.isLoading = false;
                        }
                    });
                    return;
                }
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading simulation details', err);
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

    calculateVanCurve(simulation: SimulationData, result: SimulationResult) {
        const table = result.table;
        const flows: number[] = [];

        const loanAmount = Number(simulation.loanAmount);
        const initialFeeAmount = Number(simulation.initialFeeAmount);
        const bbpAmount = Number(simulation.bbpAmount);
        const initialCommission = Number(simulation.initialCommission);
        const financedCapital = simulation.financedCapital || (loanAmount - initialFeeAmount - bbpAmount);

        const borrowerInitialFlow = financedCapital - initialCommission;
        const cf0 = -borrowerInitialFlow;

        flows.push(cf0);

        table.forEach(row => {
            flows.push(row.totalInstallment);
        });

        console.log('Calculated Flows:', flows);

        // Use TCEA (Annual Effective Rate) for the chart range
        // result.summary.tcea is in percentage (e.g., 15.5)
        const tcea = result.summary.tcea / 100;

        // Generate points based on Annual Rate
        const maxRate = tcea > 0 ? tcea * 2.5 : 0.5; // Default to 50% if TCEA is 0
        const steps = 50;
        const stepSize = maxRate / steps;

        const labels: string[] = [];
        const dataPoints: number[] = [];

        for (let i = 0; i <= steps; i++) {
            const annualRate = i * stepSize;

            // Convert Annual Rate to Monthly Rate for VAN calculation
            // Formula: Monthly = (1 + Annual)^(1/12) - 1
            const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;

            const van = this.calculateVAN(flows, monthlyRate);

            labels.push((annualRate * 100).toFixed(2) + '%');
            dataPoints.push(-van);
        }

        this.lineChartData = {
            labels: labels,
            datasets: [
                {
                    data: dataPoints,
                    label: 'VAN vs Tasa de Descuento (Anual)',
                    fill: true,
                    tension: 0.4,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: '#4f46e5',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                }
            ]
        };

        // Add TIR (TCEA) point
        // Find the index closest to the TCEA
        const tirIndex = Math.round(tcea / stepSize);

        this.lineChartData.datasets.push({
            data: dataPoints.map((_, i) => i === tirIndex ? 0 : null as any),
            label: 'TIR (TCEA)',
            pointRadius: 6,
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            showLine: false
        });

        console.log('Chart Data Generated:', {
            labels: this.lineChartData.labels,
            datasets: this.lineChartData.datasets
        });

        if (this.chart) {
            console.log('Updating chart view...');
            this.chart.update();
        }
    }

    calculateVAN(flows: number[], rate: number): number {
        return flows.reduce((acc, flow, i) => acc + flow / Math.pow(1 + rate, i), 0);
    }
}
