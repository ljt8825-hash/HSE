/**
 * Excel 工具类 — 类型安全版
 * 文件: src/utils/excel.ts
 */

import * as xlsx from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import type { ReadExcelResult, CleanRowResult, ExcelColumn, FieldConfig, ProcessImportOptions } from '../types';

class ExcelUtils {
  // ========== 通用：读取Excel文件 ==========
  static readFile(filePath: string, options: { sheetIndex?: number; sheetName?: string | null; defval?: string } = {}): ReadExcelResult {
    const { sheetIndex = 0, sheetName = null, defval = '' } = options;

    const workbook = xlsx.readFile(filePath);
    let targetSheetName: string | null = sheetName;

    if (!targetSheetName) {
      if (typeof sheetIndex === 'number' && workbook.SheetNames[sheetIndex]) {
        targetSheetName = workbook.SheetNames[sheetIndex];
      } else {
        targetSheetName = workbook.SheetNames[0];
      }
    }

    const worksheet = workbook.Sheets[targetSheetName];
    if (!worksheet) {
      return { headers: [], rows: [], sheetName: targetSheetName, totalRows: 0 };
    }

    const jsonData: Record<string, any>[] = xlsx.utils.sheet_to_json(worksheet, {
      defval,
      raw: false,
    });

    const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

    return {
      headers,
      rows: jsonData,
      sheetName: targetSheetName,
      sheetCount: workbook.SheetNames.length,
      totalRows: jsonData.length,
    };
  }

  // ========== 通用：表头列映射 ==========
  static mapHeaders(headers: string[], aliasMap: Record<string, string[]>): Record<string, string> {
    const mapping: Record<string, string> = {};

    headers.forEach(header => {
      const h = String(header).trim();
      for (const [field, aliases] of Object.entries(aliasMap)) {
        const aliasList = Array.isArray(aliases) ? aliases : [aliases];
        if (aliasList.some(a => h === a || h.includes(a))) {
          if (!mapping[field]) mapping[field] = header;
          break;
        }
      }
    });

    return mapping;
  }

  // ========== 通用：行数据清洗 ==========
  static cleanRow(row: Record<string, any>, mapping: Record<string, string>, fieldsConfig: Record<string, FieldConfig> = {}): CleanRowResult {
    const result: Record<string, any> = {};

    for (const [field, headerKey] of Object.entries(mapping)) {
      let value = row[headerKey];

      if (value === null || value === undefined) {
        value = '';
      }

      const config = fieldsConfig[field] || {};

      if (config.type === 'string') {
        value = String(value).trim();
      } else if (config.type === 'number') {
        value = parseFloat(value) || 0;
      } else if (config.type === 'int') {
        value = parseInt(value, 10) || 0;
      } else if (config.type === 'date') {
        value = this.parseDate(value);
      } else if (config.type === 'uppercase') {
        value = String(value).trim().toUpperCase();
      } else {
        value = String(value).trim();
      }

      if (config.required && !value) {
        return { valid: false, error: `字段"${field}"不能为空` };
      }

      result[field] = value || null;
    }

    return { valid: true, data: result };
  }

  // ========== 通用：日期解析 ==========
  static parseDate(val: any): string | null {
    if (!val) return null;

    if (typeof val === 'number') {
      const date = new Date((val - 25569) * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }

    const str = String(val).trim();
    const patterns: RegExp[] = [
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
      /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/,
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
    ];

    for (const pattern of patterns) {
      const match = str.match(pattern);
      if (match) {
        let year: string, month: string, day: string;
        if (pattern.source.startsWith('^(\\d{4})') || pattern.source.startsWith('^(\\d{4})年')) {
          [, year, month, day] = match;
        } else {
          [, month, day, year] = match;
        }
        month = String(month).padStart(2, '0');
        day = String(day).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }

    return null;
  }

  // ========== 通用：日期格式化（导出用） ==========
  static formatDate(val: any): string {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ========== 通用：金额格式化 ==========
  static formatMoney(val: any): string {
    if (val === null || val === undefined) return '';
    const num = Number(val);
    return isNaN(num) ? String(val) : num.toFixed(2);
  }

  // ========== 通用：生成Excel导出 ==========
  static generateExcel(data: Record<string, any>[], columns: ExcelColumn[], sheetName: string = 'Sheet1'): xlsx.WorkBook {
    const headers = columns.map(col => col.header || col.label || col.key);
    const keys = columns.map(col => col.key || col.field || '');

    const rows = data.map(item => {
      const row: Record<string, any> = {};
      keys.forEach((key, idx) => {
        const col = columns[idx];
        let val = item[key];

        if (col.formatter && typeof col.formatter === 'function') {
          val = col.formatter(val, item);
        } else if (col.type === 'date') {
          val = this.formatDate(val);
        } else if (col.type === 'money') {
          val = this.formatMoney(val);
        } else if (val === null || val === undefined) {
          val = '';
        }

        row[headers[idx]] = val;
      });
      return row;
    });

    const worksheet = xlsx.utils.json_to_sheet(rows, { header: headers });

    const colWidths = columns.map(col => {
      if (col.width) return { wch: col.width };
      const headerLen = (col.header || col.label || col.key || '').length * 2;
      return { wch: Math.max(headerLen, 12) };
    });
    (worksheet as any)['!cols'] = colWidths;

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);

    return workbook;
  }

  // ========== 通用：导出为Buffer ==========
  static toBuffer(workbook: xlsx.WorkBook): Buffer {
    return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ========== 通用：保存为文件 ==========
  static saveAs(workbook: xlsx.WorkBook, filePath: string): string {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    xlsx.writeFile(workbook, filePath);
    return filePath;
  }

  // ========== 通用：批量导入处理器 ==========
  static async processImport(options: ProcessImportOptions): Promise<{
    success: boolean;
    message?: string;
    total: number;
    successCount: number;
    failCount: number;
    failList: { row: number; reason: string }[];
  }> {
    const {
      filePath,
      aliasMap,
      fieldsConfig = {},
      uniqueKey = null,
      onEachRow = null,
      transaction = null,
    } = options;

    const { headers, rows, totalRows } = this.readFile(filePath);
    const mapping = this.mapHeaders(headers, aliasMap);

    if (uniqueKey && !mapping[uniqueKey]) {
      return {
        success: false,
        message: `未找到"${uniqueKey}"列，请检查表头`,
        total: 0,
        successCount: 0,
        failCount: 0,
        failList: [],
      };
    }

    let successCount = 0;
    let failCount = 0;
    const failList: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        const cleanResult = this.cleanRow(row, mapping, fieldsConfig);
        if (!cleanResult.valid) {
          failCount++;
          failList.push({ row: rowNum, reason: cleanResult.error || '未知错误' });
          continue;
        }

        const data = cleanResult.data!;

        if (onEachRow && typeof onEachRow === 'function') {
          await onEachRow(data, { rowNum, mapping, transaction });
        }

        successCount++;
      } catch (err: any) {
        failCount++;
        failList.push({ row: rowNum, reason: err.message });
      }
    }

    return {
      success: true,
      total: totalRows,
      successCount,
      failCount,
      failList,
    };
  }

  // ========== 预设：车辆模块表头别名 ==========
  static get vehicleAliases(): Record<string, string[]> {
    return {
      plate: ['车牌号', '车牌', '车号', 'plate'],
      vin: ['车架号', 'VIN', 'vin', '车架'],
      engine_no: ['发动机号', '发动机', 'engine_no'],
      reg_date: ['注册日期', '上牌日期', '登记日期', 'reg_date'],
      model: ['车型', '车辆型号', 'model', '车辆类型'],
      owner: ['车主', '所有人', '所属单位', 'owner'],
      insurance_type: ['保险类型', '险种', 'insurance_type'],
      insurance_start: ['保险起期', '起保日期', '生效日期', '保险开始'],
      insurance_end: ['保险止期', '到期日期', '终止日期', '保险结束', '到期日'],
      premium: ['保费', '保险费', '金额', 'premium'],
      vehicle_type: ['车辆分类', '类型', 'vehicle_type'],
      status: ['状态', 'status'],
      remark: ['备注', '说明', 'remark'],
    };
  }

  // ========== 预设：车辆导入字段配置 ==========
  static get vehicleFieldsConfig(): Record<string, FieldConfig> {
    return {
      plate: { type: 'uppercase', required: true },
      vin: { type: 'string' },
      engine_no: { type: 'string' },
      reg_date: { type: 'date' },
      model: { type: 'string' },
      owner: { type: 'string' },
      insurance_type: { type: 'string' },
      insurance_start: { type: 'date' },
      insurance_end: { type: 'date' },
      premium: { type: 'number' },
      vehicle_type: { type: 'string' },
      status: { type: 'string' },
      remark: { type: 'string' },
    };
  }

  // ========== 预设：车辆导出列配置 ==========
  static get vehicleExportColumns(): ExcelColumn[] {
    return [
      { key: 'id', header: '序号', width: 8 },
      { key: 'plate', header: '车牌号', width: 14 },
      { key: 'vin', header: '车架号', width: 22 },
      { key: 'engine_no', header: '发动机号', width: 18 },
      { key: 'reg_date', header: '注册日期', type: 'date', width: 12 },
      { key: 'model', header: '车型', width: 36 },
      { key: 'owner', header: '所有人', width: 30 },
      { key: 'insurance_type', header: '保险类型', width: 14 },
      { key: 'insurance_start', header: '保险起期', type: 'date', width: 12 },
      { key: 'insurance_end', header: '保险止期', type: 'date', width: 12 },
      { key: 'premium', header: '保费(元)', type: 'money', width: 12 },
      { key: 'days_to_expire', header: '剩余天数', width: 10,
        formatter: (val: any) => val === null || val === undefined ? '' : (val < 0 ? `已脱保${Math.abs(val)}天` : val + '天') },
      { key: 'status', header: '状态', width: 10 },
      { key: 'remark', header: '备注', width: 20 },
    ];
  }
}

export default ExcelUtils;
