// import { Component, Input, Output, EventEmitter, OnInit, ViewEncapsulation } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';
// import { Item ,Process} from '../../../models/item02.model';

// @Component({
//   selector: 'app-item-form',
//   standalone: true,
//   imports: [CommonModule, FormsModule],
//   templateUrl: './item-form.component.html',
//   styleUrls: ['./item-form.component.css'],
//   encapsulation: ViewEncapsulation.None
// })
// export class ItemFormComponent implements OnInit {

//   // 'item' = parent row form, 'process' = child row form
//   @Input() formType: 'item' | 'process' = 'item';

//   // 'insert' = blank form, 'edit' = pre-filled form
//   @Input() mode: 'insert' | 'edit' = 'insert';

//   // For item form
//   @Input() item: Item | null = null;

//   // For process form
//   @Input() process: Process | null = null;

//   // Max seq for auto-increment on process insert
//   @Input() nextSeq: number = 1;

//   @Output() save = new EventEmitter<any>();
//   @Output() cancel = new EventEmitter<void>();

//   // Item form fields
//   itemForm = { code: '', badge: '' };

//   // Process form fields
//   processForm = { seq: 1, code: '', type: 1, supplierCode: '' };

//   ngOnInit(): void {
//     if (this.formType === 'item' && this.mode === 'edit' && this.item) {
//       this.itemForm.code = this.item.code;
//       this.itemForm.badge = this.item.badge;
//     }

//     if (this.formType === 'process') {
//       if (this.mode === 'edit' && this.process) {
//         this.processForm.seq = this.process.seq;
//         this.processForm.code = this.process.code;
//         this.processForm.type = this.process.type;
//         // this.processForm.supplierCode = this.process.supplierCode ?? '';
//       } else {
//         this.processForm.seq = this.nextSeq;
//       }
//     }
//   }

//   // Auto-generate badge from first letter of item code
//   onItemCodeChange(): void {
//     if (this.itemForm.code) {
//       this.itemForm.badge = this.itemForm.code.charAt(0).toUpperCase();
//     } else {
//       this.itemForm.badge = '';
//     }
//   }

//   // Show/hide supplier field based on process type
//   get showSupplier(): boolean {
//     return this.processForm.type === 2;
//   }

//   get isItemFormValid(): boolean {
//     return this.itemForm.code.trim().length > 0;
//   }

//   get isProcessFormValid(): boolean {
//     return this.processForm.code.trim().length > 0;
//   }

//   onSave(): void {
//     if (this.formType === 'item') {
//       if (!this.isItemFormValid) return;
//       const result: Partial<Item> = {
//         code: this.itemForm.code.trim().toUpperCase(),
//         badge: this.itemForm.code.trim().charAt(0).toUpperCase(),
//         processes: this.item?.processes ?? [],
//         expanded: this.item?.expanded ?? false
//       };
//       this.save.emit(result);
//     } else {
//       if (!this.isProcessFormValid) return;
//       const result: Process = {
//         seq: this.processForm.seq,
//         code: this.processForm.code.trim().toUpperCase(),
//         type: this.processForm.type,
//         // supplierCode: this.showSupplier ? (this.processForm.supplierCode.trim() || null) : null
//       };
//       this.save.emit(result);
//     }
//   }

//   onCancel(): void {
//     this.cancel.emit();
//   }
// }