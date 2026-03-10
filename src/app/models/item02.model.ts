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