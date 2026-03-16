export interface Process {
  seq: number;
  code: string;
  type: number;
  supplierCode: string | null;
}

export interface Item {
  code: string;
  badge: string;
  processes: Process[];
  expanded: boolean;
}
export interface Supplier {
  code: string;
}
export interface PendingChange {
  id: number;           // unique local id
  itemCode: string;
  type: 'edit' | 'insert';
  seq: number;          // for edit: existing seq; for insert: insertAfterSeq (0 = end)
  code: string;
  processType: 1 | 2;
  supplierCode: string;
}