import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SimulationService, SimulationData, SimulationResult } from '../../core/services/simulation.service';
import { ExportService } from '../../core/services/export.service';
import { forkJoin, map, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
    selector: 'app-export',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './export.component.html',
    styleUrl: './export.component.scss'
})
export class ExportComponent implements OnInit {
    private simulationService = inject(SimulationService);
    private exportService = inject(ExportService);

    simulations: SimulationData[] = [];
    latestSimulation: SimulationData | null = null;
    selectedSimulations: Set<string> = new Set();

    stats = {
        total: 0,
        completed: 0,
        drafts: 0,
        pen: 0,
        usd: 0
    };

    ngOnInit() {
        this.loadSimulations();
    }

    loadSimulations() {
        this.simulationService.getMyLoans().subscribe({
            next: (data) => {
                this.simulations = data.sort((a, b) => {
                    const dateA = new Date(a.createdAt || a.disbursementDate || 0).getTime();
                    const dateB = new Date(b.createdAt || b.disbursementDate || 0).getTime();
                    return dateB - dateA;
                });
                this.calculateStats();
                this.findLatestSimulation();
            },
            error: (err) => console.error('Error loading simulations', err)
        });
    }

    calculateStats() {
        this.stats.total = this.simulations.length;
        this.stats.completed = this.simulations.length;
        this.stats.drafts = 0;
        this.stats.pen = this.simulations.filter(s => s.currency === 'PEN').length;
        this.stats.usd = this.simulations.filter(s => s.currency === 'USD').length;
    }

    findLatestSimulation() {
        if (this.simulations.length > 0) {
            this.latestSimulation = this.simulations[0];
        }
    }

    toggleSelection(id: string | undefined) {
        if (!id) return;
        if (this.selectedSimulations.has(id)) {
            this.selectedSimulations.delete(id);
        } else {
            this.selectedSimulations.add(id);
        }
    }

    toggleAll(event: any) {
        if (event.target.checked) {
            this.simulations.forEach(s => {
                if (s.id) this.selectedSimulations.add(s.id);
            });
        } else {
            this.selectedSimulations.clear();
        }
    }

    isAllSelected(): boolean {
        return this.simulations.length > 0 && this.selectedSimulations.size === this.simulations.length;
    }

    quickExport() {
        if (!this.latestSimulation || !this.latestSimulation.id) return;

        console.log('Quick Export: Fetching details for ID:', this.latestSimulation.id);

        this.simulationService.getSimulationById(this.latestSimulation.id).subscribe({
            next: (fullSimulation: any) => {
                try {
                    let result = fullSimulation;
                    result = this.simulationService.recalculateIndicators(fullSimulation, fullSimulation);
                    result = this.simulationService.recalculateIndicators(fullSimulation, fullSimulation);

                    this.exportService.exportSimulation(fullSimulation, result);
                } catch (error) {
                    alert('Error al exportar: ' + error);
                }
            },
            error: (err) => {
                console.error('Error fetching details for export', err);
                alert('Error al obtener los detalles de la simulación.');
            }
        });
    }

    batchExport() {
        if (this.selectedSimulations.size === 0) return;

        const selectedIds = Array.from(this.selectedSimulations);
        const requests = selectedIds.map(id => {
            return this.simulationService.getSimulationById(id).pipe(
                map((fullSimulation: any) => {
                    const result = this.simulationService.recalculateIndicators(fullSimulation, fullSimulation);
                    return { data: fullSimulation, result: result };
                }),
                catchError(err => {
                    console.error('Error fetching for batch export item:', id, err);
                    return of({ data: { name: 'Error' } as any, result: undefined });
                })
            );
        });

        forkJoin(requests).subscribe({
            next: (results) => {
                const validResults = results.filter(r => r.data.name !== 'Error');

                this.exportService.exportSimulationsBatch(validResults)
                    .catch(err => {
                        console.error('Error in batch export', err);
                        alert('Error al generar la exportación en lote.');
                    });
            },
            error: (err) => {
                console.error('Error in batch export', err);
                alert('Error al preparar la exportación en lote.');
            }
        });
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
}
