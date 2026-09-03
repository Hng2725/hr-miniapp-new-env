import { PayrollRecord, IPayrollService } from '../types';
import { McpApp } from '@privos_ai/app-react';

export class PayrollService implements IPayrollService {
  private readonly app: McpApp;
  private readonly roomId: string;
  private readonly collectionName = 'payroll_records';

  constructor(app: McpApp, roomId: string) {
    if (!app) throw new Error("PayrollService requires a valid McpApp instance.");
    if (!roomId) throw new Error("PayrollService requires a roomId.");
    
    this.app = app;
    this.roomId = roomId;
  }

  async initializeSchema(): Promise<void> {
    try {
      await this.app.callServerTool({
        name: 'privos.db.registerCollection',
        arguments: {
          roomId: this.roomId,
          collection: this.collectionName,
          fields: [
            { name: 'employeeId', type: 'string', required: true },
            { name: 'baseSalary', type: 'number', required: true },
            { name: 'taxId', type: 'string' },
            { name: 'bankAccount', type: 'string' },
            { name: 'roomId', type: 'string', required: true }
          ]
        }
      });
    } catch (err) {
      console.warn("Could not register schema, might already exist or not supported.", err);
    }
  }

  async getRecords(): Promise<PayrollRecord[]> {
    try {
      const res: any = await this.app.callServerTool({
        name: 'hrm.payroll.query',
        arguments: {
          roomId: this.roomId,
          collection: this.collectionName,
          where: [{ field: 'roomId', op: '==', value: this.roomId }]
        }
      });
      const parsed = typeof res?.content?.[0]?.text === 'string' 
        ? JSON.parse(res.content[0].text) 
        : { records: [] };
      return parsed.records || [];
    } catch (err) {
      console.error("Failed to fetch payroll records:", err);
      throw err;
    }
  }

  async saveRecord(record: PayrollRecord): Promise<void> {
    const { _id, _createdAt, _updatedAt, ...rest } = record as any;
    const data = { ...rest, roomId: this.roomId };
    
    if (record._id) {
      await this.app.callServerTool({
        name: 'hrm.payroll.update',
        arguments: { roomId: this.roomId, collection: this.collectionName, id: record._id, data }
      });
    } else {
      await this.app.callServerTool({
        name: 'hrm.payroll.create',
        arguments: { roomId: this.roomId, collection: this.collectionName, data }
      });
    }
  }

  async deleteRecord(id: string): Promise<void> {
    await this.app.callServerTool({
      name: 'hrm.payroll.delete',
      arguments: { roomId: this.roomId, collection: this.collectionName, id }
    });
  }
}
