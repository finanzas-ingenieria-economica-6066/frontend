import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { SimulationData, SimulationResult } from './simulation.service';
import JSZip from 'jszip';

@Injectable({
    providedIn: 'root'
})
export class ExportService {

    constructor() { }

    /**
     * Generates an Excel buffer for a single simulation.
     */
    generateExcelBuffer(simulation: SimulationData, result?: SimulationResult): any {
        const wb: XLSX.WorkBook = { Sheets: {}, SheetNames: [] };

        // 0. Datos Sheet (Raw API Data)
        const apiData = {
            id: simulation.id,
            name: simulation.name,
            currency: simulation.currency,
            loanAmount: simulation.loanAmount,
            bbpAmount: simulation.bbpAmount,
            initialFeePercentage: simulation.initialFeePercentage,
            initialFeeAmount: simulation.initialFeeAmount,
            financedCapital: simulation.financedCapital,
            exchangeRate: simulation.exchangeRate,
            interestType: simulation.interestType,
            annualRate: simulation.annualRate,
            capitalizationPeriod: simulation.capitalizationPeriod,
            paymentFrequency: simulation.paymentFrequency,
            totalMonths: simulation.totalMonths,
            gracePeriodType: simulation.gracePeriodType,
            gracePeriodMonths: simulation.gracePeriodMonths,
            insurancePercentage: simulation.insurancePercentage,
            fixedInsurance: simulation.fixedInsurance,
            initialCommission: simulation.initialCommission,
            periodicCommission: simulation.periodicCommission,
            finalCommission: simulation.finalCommission,
            disbursementDate: simulation.disbursementDate,
            discountRate: simulation.discountRate
        };
        const wsDatos = XLSX.utils.json_to_sheet([apiData]);
        wb.Sheets['Datos'] = wsDatos;
        wb.SheetNames.push('Datos');

        // 1. Amortización Sheet (Schedule)
        let scheduleData: any[] = [];
        if (result && result.table) {
            scheduleData = result.table.map(row => ({
                'N°': row.period,
                'Fecha': row.date,
                'Saldo Inicial': row.initialBalance,
                'Interés': row.interest,
                'Amortización': row.amortization,
                'Seguro': row.insurance,
                'Comisión': row.commissions,
                'Cuota Total': row.totalInstallment,
                'Saldo Final': row.finalBalance
            }));
        } else {
            // Empty sheet with headers if no result
            scheduleData = [{
                'N°': '',
                'Fecha': '',
                'Saldo Inicial': '',
                'Interés': '',
                'Amortización': '',
                'Seguro': '',
                'Comisión': '',
                'Cuota Total': '',
                'Saldo Final': ''
            }];
        }

        const wsSchedule = XLSX.utils.json_to_sheet(scheduleData);
        // If empty, we might want to remove the dummy row, but headers are needed.
        // json_to_sheet with empty array creates no headers by default unless specified?
        // Let's stick to the dummy row or just headers if possible. 
        // For now, if no data, just headers is better, but json_to_sheet needs data for headers usually unless 'header' option is used.
        // Let's use empty string values as above to ensure headers appear.

        if (!result || !result.table) {
            // If we want just headers, we can pass an empty array and specify headers, 
            // but the above approach with empty strings is safer to ensure columns exist.
            // Actually, let's just use the headers array.
            const headers = ['N°', 'Fecha', 'Saldo Inicial', 'Interés', 'Amortización', 'Seguro', 'Comisión', 'Cuota Total', 'Saldo Final'];
            XLSX.utils.sheet_add_aoa(wsSchedule, [headers], { origin: "A1" });
            // But json_to_sheet([{}]) might produce something.
            // Let's stick to the previous map logic but handle empty.
        }

        wb.Sheets['Amortización'] = wsSchedule;
        wb.SheetNames.push('Amortización');

        return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    }

    /**
     * Exports a single simulation to Excel file.
     */
    /**
     * Exports a single simulation to Excel file.
     */
    exportSimulation(simulation: SimulationData, result?: SimulationResult) {
        try {
            const buffer = this.generateExcelBuffer(simulation, result);
            const fileName = this.generateFileName(simulation.name);
            this.saveAsExcelFile(buffer, fileName);
        } catch (error) {
            console.error('Export error:', error);
            throw error;
        }
    }

    /**
     * Exports multiple simulations to a ZIP file containing Excel files.
     */
    async exportSimulationsBatch(simulations: { data: SimulationData, result?: SimulationResult }[]) {
        try {
            const zip = new JSZip();

            simulations.forEach(item => {
                const buffer = this.generateExcelBuffer(item.data, item.result);
                const fileName = this.generateFileName(item.data.name) + '.xlsx';
                zip.file(fileName, buffer);
            });

            const dateStr = new Date().toISOString().split('T')[0];
            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, `Simulaciones_Lote_${dateStr}.zip`);
        } catch (error) {
            console.error('Batch export error:', error);
            throw error;
        }
    }

    private generateFileName(name: string): string {
        // Clean up the name: remove special chars, replace spaces with underscores
        let cleanName = name.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

        // Avoid redundant "Simulacion" prefix if already present
        if (cleanName.toLowerCase().startsWith('simulacion') || cleanName.toLowerCase().startsWith('simulation')) {
            // Keep it as is or maybe capitalize it nicely? 
            // Let's just ensure it starts with "Simulacion_"
            // If it starts with "Simulacion_", we leave it.
            // If it starts with "Simulacion" but not followed by _, we might want to fix it?
            // Simplest: If it doesn't start with Simulacion, prepend it.
        } else {
            cleanName = `Simulacion_${cleanName}`;
        }

        // Add date for uniqueness
        const dateStr = new Date().toISOString().split('T')[0];
        return `${cleanName}_${dateStr}`;
    }

    private saveAsExcelFile(buffer: any, fileName: string): void {
        const EXCEL_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8';
        const EXCEL_EXTENSION = '.xlsx';
        const data: Blob = new Blob([buffer], { type: EXCEL_TYPE });
        saveAs(data, fileName + EXCEL_EXTENSION);
    }
}
