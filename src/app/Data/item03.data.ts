// import { Item002} from '../models/item02.model';
import { Item, Process } from '../models/item03.model';
  export const ITEM_DATA: Item[] = [
     {
      code: 'SF5101', badge: 'S', expanded: false,
      processes: [
        { seq: 1, code: 'CUT',  type: 1, supplierCode: null },
        { seq: 2, code: 'ROLL', type: 2, supplierCode: 'SUP900' }
      ]
    },
    {
      code: 'RM6001', badge: 'R', expanded: false,
      processes: [
        { seq: 1, code: 'PRC1', type: 1, supplierCode: null },
        { seq: 2, code: 'PRC2', type: 2, supplierCode: 'SUP001' }
      ]
    },
    {
      code: 'AB8200', badge: 'A', expanded: false,
      processes: [
        { seq: 1, code: 'WELD',  type: 1, supplierCode: null },
        { seq: 2, code: 'GRND',  type: 2, supplierCode: 'SUP456' },
        { seq: 3, code: 'PAINT', type: 2, supplierCode: 'SUP789' }
      ]
    },
    {
      code: 'CD4005', badge: 'C', expanded: false,
      processes: [
        { seq: 1, code: 'CNC',  type: 1, supplierCode: null },
        { seq: 2, code: 'DRIL', type: 2, supplierCode: 'SUP101' }
      ]
    }
  ];