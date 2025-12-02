import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { SimulationService, SimulationData } from '../../../core/services/simulation.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
    selector: 'app-simulation-list',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './simulation-list.component.html',
    styleUrl: './simulation-list.component.scss'
})
export class SimulationListComponent implements OnInit {
    simulations: SimulationData[] = [];
    averageCapital: number = 0;
    solesCount: number = 0;
    dollarsCount: number = 0;
    userId: number | null = null;

    constructor(
        private simulationService: SimulationService,
        private authService: AuthService,
        private router: Router
    ) { }

    ngOnInit(): void {
        this.authService.currentUser$.subscribe(user => {
            if (user && user.id) {
                this.userId = user.id;
            }
        });
        this.loadSimulations();
    }

    loadSimulations() {
        this.simulationService.getMyLoans().subscribe(data => {
            this.simulations = data;
            this.calculateStats();
        });
    }

    calculateStats() {
        if (this.simulations.length === 0) {
            this.averageCapital = 0;
            this.solesCount = 0;
            this.dollarsCount = 0;
            return;
        }

        const total = this.simulations.reduce((acc, sim) => acc + sim.loanAmount, 0);
        this.averageCapital = total / this.simulations.length;

        this.solesCount = this.simulations.filter(s => s.currency === 'PEN').length;
        this.dollarsCount = this.simulations.filter(s => s.currency === 'USD').length;
    }

    duplicateSimulation(id: string | undefined, event: Event) {
        event.stopPropagation();
        if (!id) return;

        if (!this.userId) {
            alert('No se pudo identificar el usuario actual. Por favor, inicia sesión nuevamente.');
            return;
        }

        if (confirm('¿Deseas duplicar esta simulación?')) {
            this.simulationService.getSimulationById(id).subscribe({
                next: (originalSim) => {
                    let newName = originalSim.name;
                    const versionRegex = / - v(\d+)$/;
                    const match = newName.match(versionRegex);

                    if (match) {
                        const version = parseInt(match[1], 10) + 1;
                        newName = newName.replace(versionRegex, ` - v${version}`);
                    } else {
                        if (newName.endsWith(' - Copia')) {
                            newName = newName.replace(' - Copia', ' - v2');
                        } else {
                            newName = `${newName} - v2`;
                        }
                    }

                    const newSim: SimulationData = {
                        name: newName,
                        userId: this.userId!,
                        currency: originalSim.currency,
                        loanAmount: originalSim.loanAmount,
                        bbpAmount: originalSim.bbpAmount,
                        initialFeePercentage: originalSim.initialFeePercentage,
                        initialFeeAmount: originalSim.initialFeeAmount,
                        exchangeRate: originalSim.exchangeRate,
                        interestType: originalSim.interestType,
                        annualRate: originalSim.annualRate,
                        capitalizationPeriod: originalSim.capitalizationPeriod,
                        paymentFrequency: originalSim.paymentFrequency,
                        totalMonths: originalSim.totalMonths,
                        gracePeriodType: originalSim.gracePeriodType,
                        gracePeriodMonths: originalSim.gracePeriodMonths,
                        insurancePercentage: originalSim.insurancePercentage,
                        fixedInsurance: originalSim.fixedInsurance,
                        initialCommission: originalSim.initialCommission,
                        periodicCommission: originalSim.periodicCommission,
                        finalCommission: originalSim.finalCommission,
                        disbursementDate: originalSim.disbursementDate,
                        discountRate: originalSim.discountRate
                    };

                    this.simulationService.saveSimulation(newSim).subscribe({
                        next: () => {
                            this.loadSimulations();
                        },
                        error: (err) => {
                            console.error('Error duplicating simulation:', err);
                            alert('Error al duplicar la simulación. Por favor verifica los datos.');
                        }
                    });
                },
                error: (err) => {
                    console.error('Error fetching simulation:', err);
                    alert('Error al obtener los datos de la simulación');
                }
            });
        }
    }

    deleteSimulation(id: string | undefined, event: Event) {
        event.stopPropagation();
        if (id) {
            if (confirm('¿Estás seguro de eliminar esta simulación?')) {
                this.simulationService.deleteSimulation(id).subscribe(() => {
                    this.loadSimulations();
                });
            }
        }
    }

    viewSimulation(id: string | undefined) {
        if (id) {
            this.router.navigate(['/simulation', id]);
        }
    }
}
