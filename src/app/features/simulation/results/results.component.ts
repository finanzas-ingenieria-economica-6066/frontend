import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SimulationResult } from '../../../core/services/simulation.service';
import { ExportService } from '../../../core/services/export.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './results.component.html',
  styleUrl: './results.component.scss'
})
export class ResultsComponent {
  @Input() result: SimulationResult | null = null;
  @Input() data: any | null = null;

  private exportService = inject(ExportService);

  exportToExcel() {
    if (!this.result || !this.data) {
      alert('No hay datos para exportar.');
      return;
    }

    try {
      this.exportService.exportSimulation(this.data, this.result);
    } catch (error) {
      alert('Error al exportar: ' + error);
    }
  }
}
