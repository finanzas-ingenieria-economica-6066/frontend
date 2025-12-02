import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SimulationService, SimulationData, SimulationResult } from '../../core/services/simulation.service';

interface ComparisonItem {
    simulation: SimulationData;
    result: SimulationResult;
    isBest?: boolean;
}

@Component({
    selector: 'app-comparator',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './comparator.component.html',
    styleUrls: ['./comparator.component.scss']
})
export class ComparatorComponent implements OnInit {
    simulations: SimulationData[] = [];
    selectedSimulationIds: Set<string> = new Set();
    comparisonItems: ComparisonItem[] = [];
    isLoading = false;
    bestOptionId: string | null = null;
    bestItem: ComparisonItem | null = null;

    constructor(private simulationService: SimulationService) { }

    ngOnInit(): void {
        this.loadSimulations();
    }

    loadSimulations() {
        this.isLoading = true;
        this.simulationService.getMyLoans().subscribe({
            next: (data) => {
                this.simulations = data;
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading simulations', err);
                this.isLoading = false;
            }
        });
    }

    toggleSelection(id: string | undefined) {
        if (!id) return;

        if (this.selectedSimulationIds.has(id)) {
            this.selectedSimulationIds.delete(id);
        } else {
            if (this.selectedSimulationIds.size >= 3) {
                alert('Puedes comparar hasta 3 simulaciones a la vez.');
                return;
            }
            this.selectedSimulationIds.add(id);
        }
        this.updateComparison();
    }

    isSelected(id: string | undefined): boolean {
        return id ? this.selectedSimulationIds.has(id) : false;
    }

    updateComparison() {
        if (this.selectedSimulationIds.size < 2) {
            this.comparisonItems = [];
            this.bestOptionId = null;
            this.bestItem = null;
            return;
        }

        this.isLoading = true;
        const selectedSims = this.simulations.filter(s => s.id && this.selectedSimulationIds.has(s.id));
        const items: ComparisonItem[] = [];

        let completedRequests = 0;

        selectedSims.forEach(sim => {
            if (!sim.id) return;

            this.simulationService.getSimulationById(sim.id).subscribe({
                next: (fullData: any) => {
                    let result: SimulationResult | null = null;

                    if (fullData.flows) {
                        result = this.simulationService.recalculateIndicators(fullData, { flows: fullData.flows });
                    } else if (fullData.table) {
                        result = this.simulationService.recalculateIndicators(fullData, fullData);
                    } else if (fullData.results) {
                        result = this.simulationService.recalculateIndicators(fullData, fullData.results);
                    }

                    if (result) {
                        items.push({ simulation: sim, result: result });
                    }

                    completedRequests++;
                    if (completedRequests === selectedSims.length) {
                        this.comparisonItems = items;
                        this.determineBestOption();
                        this.isLoading = false;
                    }
                },
                error: (err) => {
                    console.error(`Error loading details for ${sim.id}`, err);
                    completedRequests++;
                    if (completedRequests === selectedSims.length) {
                        this.isLoading = false;
                    }
                }
            });
        });
    }

    determineBestOption() {
        if (this.comparisonItems.length === 0) {
            this.bestOptionId = null;
            this.bestItem = null;
            return;
        }

        let bestItem = this.comparisonItems[0];
        let minTcea = bestItem.result.summary.tcea;

        for (const item of this.comparisonItems) {
            if (item.result.summary.tcea < minTcea) {
                minTcea = item.result.summary.tcea;
                bestItem = item;
            }
        }

        this.bestOptionId = bestItem.simulation.id || null;
        this.bestItem = bestItem;
    }


}
