import { Component, OnInit, ViewEncapsulation, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Item, Process } from '../../models/item02.model';

// ── Bulk-add draft interfaces (outside class, at file level) ──
interface DraftProcess {
  code:         string;
  type:         1 | 2;
  supplierCode: string;
}

interface DraftItem {
  id:        number;   // local tracking only — never sent to backend
  code:      string;
  badge:     string;
  processes: DraftProcess[];
}

@Component({
  selector: 'app-item-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.item03.html',
  styleUrls: ['./app.item03.css'],
  encapsulation: ViewEncapsulation.None
})
export class ItemTableComponent implements OnInit {

  private apiUrl = 'http://localhost:5254/api/Item';

  // ── Search ──
  searchTerm: string = '';
  insertAfterSeq: number | null = null;
  insertingProcess: Item | null = null;

  // ── Loading & Error ──
  isLoading: boolean = false;
  errorMessage: string = '';

  // ── Item insert form state ──
  showInsertForm: boolean = false;
  insertItemForm = { code: '', badge: '' };

  // ── Item edit form state ──
  editingItemCode: string | null = null;
  editItemForm = { code: '', badge: '' };

  // ── Process insert form state ──
  insertingProcessItem: Item | null = null;
  insertProcessForm1 = { code: '', type: 1, supplierCode: '' };
  insertProcessForm  = { code: '', type: 1, supplierCode: '' };

  // ── Process edit form state ──
  editingProcessSeq: number | null = null;
  editingProcessItem: Item | null = null;
  editProcessForm = { code: '', type: 1, supplierCode: '' };

  // ── Bulk update state (existing) ──
  showBulkUpdateModal: boolean = false;
  bulkEditItems: any[] = [];

  // ── Bulk ADD state (new) ──
  showBulkAddModal  = false;
  bulkAddItems: DraftItem[] = [];
  bulkAddNextId     = 1;
  bulkAddSaving     = false;
  bulkAddError      = '';

  // ── Data ──
  items: (Item & { selected?: boolean })[] = [];

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.loadItems();
  }

  // ── Map backend response to frontend model ──
  private mapItem(item: any): Item & { selected: boolean } {
    return {
      code: item.code ?? item.Code,
      badge: item.badge ?? item.Badge ?? (item.code ?? item.Code).charAt(0),
      expanded: false,
      selected: false,
      processes: (item.processes ?? item.Processes ?? []).map((p: any) => ({
        seq:          p.seq          ?? p.Seq,
        code:         p.code         ?? p.Code,
        type:         p.type         ?? p.Type,
        supplierCode: p.supplierCode ?? p.SupplierCode ?? null
      }))
    };
  }

  // ════════════════════════════════════════
  // LOAD — GET /api/Item
  // ════════════════════════════════════════
  loadItems(): void {
    this.isLoading    = true;
    this.errorMessage = '';

    this.http.get<any[]>(this.apiUrl).subscribe({
      next: (data) => {
        setTimeout(() => {
          this.items     = data.map(i => this.mapItem(i));
          this.isLoading = false;
          this.cdr.detectChanges();
        }, 2000);
      },
      error: (err) => {
        this.errorMessage = 'Failed to load items.';
        this.isLoading    = false;
        this.cdr.detectChanges();
        console.error(err);
      }
    });
  }

  // ── Search filter ──
  get filteredItems(): (Item & { selected?: boolean })[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.items;
    const searchTerms = term.split(',').map(s => s.trim()).filter(s => s.length > 0);
    return this.items.filter(item =>
      searchTerms.some(t =>
        item.code.toLowerCase().includes(t) ||
        item.processes.some(p => p.code.toLowerCase().includes(t))
      )
    );
  }

  // ════════════════════════════════════════
  // SUMMARY COUNTS
  // ════════════════════════════════════════
  get totalCount():           number { return this.items.length; }
  get processCount():         number { return this.items.reduce((s, i) => s + i.processes.length, 0); }
  get supplierCount():        number { return new Set(this.items.flatMap(i => i.processes.map(p => p.supplierCode))).size; }
  get internalProcessCount(): number { return this.items.reduce((s, i) => s + i.processes.filter(p => p.type === 1).length, 0); }
  get externalProcessCount(): number { return this.items.reduce((s, i) => s + i.processes.filter(p => p.type === 2).length, 0); }

  // ════════════════════════════════════════
  // PROCESS REORDERING
  // ════════════════════════════════════════
  // moveProcessUp(item: any, index: number): void {
  //   if (index === 0) return;
  //   this.saveReorder(item, index, index - 1);
  // }

  // moveProcessDown(item: any, index: number): void {
  //   if (index === item.processes.length - 1) return;
  //   this.saveReorder(item, index, index + 1);
  // }

  // saveReorder(item: any, fromIndex: number, toIndex: number): void {
  //   const temp = item.processes[fromIndex];
  //   item.processes[fromIndex] = item.processes[toIndex];
  //   item.processes[toIndex]   = temp;
  //   item.processes.forEach((p: any, i: number) => p.seq = i + 1);
  //   this.cdr.detectChanges();

  //   this.http.put<Item>(
  //     `${this.apiUrl}/${item.code}/processes/reorder?from=${fromIndex}&to=${toIndex}`,
  //     {},
  //     { headers: { 'Content-Type': 'application/json' } }
  //   ).subscribe({
  //     next: (updated: Item) => {
  //       item.processes = updated.processes.map((p: Process) => ({
  //         seq:          p.seq,
  //         code:         p.code,
  //         type:         p.type,
  //         supplierCode: p.supplierCode ?? null
  //       }));
  //       this.cdr.detectChanges();
  //     },
  //     error: (err) => {
  //       alert('Failed to reorder.');
  //       console.error(err);
  //       this.loadItems();
  //     }
  //   });
  // }

  // ════════════════════════════════════════
  // SELECTION
  // ════════════════════════════════════════
  getSelectedCount(): number  { return this.items.filter(i => i.selected).length; }
  isAllSelected():    boolean { return this.items.length > 0 && this.items.every(i => i.selected); } 

  toggleAllSelection(event: any): void {
    this.filteredItems.forEach(i => i.selected = event.target.checked);
  }

  clearSelection(): void { this.items.forEach(i => i.selected = false); }

  toggleProcess(item: any): void {
    const isAlreadyOpen = item.expanded;
    this.items.forEach(i => i.expanded = false);
    if (!isAlreadyOpen) item.expanded = true;
    this.insertingProcessItem = null;
    this.insertAfterSeq       = null;
    this.editingProcessItem   = null;
    this.editingProcessSeq    = null;
  }

  // ════════════════════════════════════════
  // ITEM INSERT — POST /api/Item
  // ════════════════════════════════════════
  openInsertForm(): void {
    this.editingItemCode = null;
    this.insertItemForm  = { code: '', badge: '' };
    this.showInsertForm  = true;
  }

  onInsertItemCodeChange(): void {
    this.insertItemForm.badge = this.insertItemForm.code
      ? this.insertItemForm.code.charAt(0).toUpperCase() : '';
  }

  onInsertSave(): void {
    const code = this.insertItemForm.code.trim().toUpperCase();
    if (!code) return;

    const payload = { code, badge: code.charAt(0), expanded: false, processes: [] };

    this.http.post<any>(this.apiUrl, payload).subscribe({
      next: (created) => {
        this.items.unshift(this.mapItem(created));
        this.showInsertForm = false;
        this.insertItemForm = { code: '', badge: '' };
        this.cdr.detectChanges();
      },
      error: (err) => {
        alert(err.status === 409
          ? `Item "${code}" already exists.`
          : 'Failed to create item.');
        console.error(err);
      }
    });
  }

  onInsertCancel(): void {
    this.showInsertForm = false;
    this.insertItemForm = { code: '', badge: '' };
  }

  // ════════════════════════════════════════
  // ITEM EDIT — PUT /api/Item/{code}
  // ════════════════════════════════════════
  openEditForm(item: Item): void {
    this.showInsertForm = false;
    if (this.editingItemCode === item.code) {
      this.editingItemCode = null;
    } else {
      this.editingItemCode = item.code;
      this.editItemForm    = { code: item.code, badge: item.badge };
    }
  }

  isEditing(item: Item): boolean { return this.editingItemCode === item.code; }

  onEditItemCodeChange(): void {
    this.editItemForm.badge = this.editItemForm.code
      ? this.editItemForm.code.charAt(0).toUpperCase() : '';
  }

  onEditSave(item: Item): void {
    const code = this.editItemForm.code.trim().toUpperCase();
    if (!code) return;

    this.http.put<any>(`${this.apiUrl}/${item.code}`, { code, badge: code.charAt(0) }).subscribe({
      next: (updated) => {
        item.code  = updated.code  ?? updated.Code;
        item.badge = updated.badge ?? updated.Badge;
        this.editingItemCode = null;
        this.cdr.detectChanges();
      },
      error: (err) => {
        alert(err.status === 409
          ? `Item "${code}" already exists.`
          : 'Failed to update item.');
        console.error(err);
      }
    });
  }

  onEditCancel(): void { this.editingItemCode = null; }

  // ════════════════════════════════════════
  // ITEM DELETE — DELETE /api/Item/{code}
  // ════════════════════════════════════════
  deleteItem(item: Item): void {
    if (!confirm(`Delete item "${item.code}" and all its processes?`)) return;

    this.http.delete(`${this.apiUrl}/${item.code}`).subscribe({
      next: () => {
        this.items = this.items.filter(i => i !== item);
        if (this.editingItemCode === item.code) this.editingItemCode = null;
        this.cdr.detectChanges();
      },
      error: (err) => { alert('Failed to delete item.'); console.error(err); }
    });
  }

  // DELETE ALL — DELETE /api/Item
  deleteAllItems(): void {
    if (!confirm('Delete ALL items?')) return;

    this.http.delete(this.apiUrl).subscribe({
      next: () => {
        this.items                = [];
        this.showInsertForm       = false;
        this.editingItemCode      = null;
        this.insertingProcessItem = null;
        this.editingProcessItem   = null;
        this.cdr.detectChanges();
      },
      error: (err) => { alert('Failed to delete all items.'); console.error(err); }
    });
  }

  // ════════════════════════════════════════
  // PROCESS INSERT — POST /api/Item/{code}/processes
  // ════════════════════════════════════════
  openInsertProcess(item: Item): void {
    this.editingProcessSeq    = null;
    this.editingProcessItem   = null;
    this.insertProcessForm1   = { code: '', type: 1, supplierCode: '' };
    this.insertingProcess     = item;
  }

  openInsertProcessBetween(item: any, process: any): void {
    this.editingProcessItem = null;
    this.editingProcessSeq  = null;
    if (this.insertingProcessItem === item && this.insertAfterSeq === process.seq) {
      this.insertingProcessItem = null;
      this.insertAfterSeq       = null;
    } else {
      this.insertingProcessItem = item;
      this.insertAfterSeq       = process.seq;
      this.insertProcessForm    = { code: '', type: 1, supplierCode: '' };
    }
  }

  openInsertProcessAtEnd(item: Item): void {
    this.editingProcessItem   = null;
    this.editingProcessSeq    = null;
    this.insertAfterSeq       = null;
    this.insertingProcessItem = item;
    this.insertProcessForm    = { code: '', type: 1, supplierCode: '' };
  }

  onInsertProcessSave(item: any): void {
    const payload = {
      insertAfterSeq: this.insertAfterSeq,
      newProcess: {
        seq:          0,
        code:         this.insertProcessForm.code.trim().toUpperCase(),
        type:         this.insertProcessForm.type,
        supplierCode: this.insertProcessForm.type === 2
          ? this.insertProcessForm.supplierCode : null
      }
    };

    this.http.post<any>(`${this.apiUrl}/${item.code}/processes`, payload).subscribe({
      next: (updatedItem) => {
        item.processes = (updatedItem.processes ?? updatedItem.Processes).map((p: any) => ({
          seq:          p.seq          ?? p.Seq,
          code:         p.code         ?? p.Code,
          type:         p.type         ?? p.Type,
          supplierCode: p.supplierCode ?? p.SupplierCode ?? null
        }));
        this.insertAfterSeq       = null;
        this.insertingProcessItem = null;
        this.cdr.detectChanges();
      },
      error: (err) => { alert('Failed to insert process.'); console.error(err); }
    });
  }

  onInsertProcessCancel(): void {
    this.insertingProcessItem = null;
    this.insertAfterSeq       = null;
    this.insertProcessForm    = { code: '', type: 1, supplierCode: '' };
  }

  trackProcess(index: number, process: any): number { return process.seq; }

  // ════════════════════════════════════════
  // PROCESS EDIT — PUT /api/Item/{code}/processes/{seq}
  // ════════════════════════════════════════
  openEditProcess(item: Item, process: Process): void {
    this.insertingProcessItem = null;
    this.insertAfterSeq       = null;
    if (this.editingProcessSeq === process.seq && this.editingProcessItem === item) {
      this.editingProcessSeq  = null;
      this.editingProcessItem = null;
    } else {
      this.editingProcessSeq  = process.seq;
      this.editingProcessItem = item;
      this.editProcessForm    = {
        code:         process.code,
        type:         process.type,
        supplierCode: process.supplierCode ?? ''
      };
    }
  }

  onEditProcessSave(item: Item, process: Process): void {
    const code = this.editProcessForm.code.trim().toUpperCase();
    if (!code) return;

    const payload = {
      seq:          process.seq,
      code,
      type:         this.editProcessForm.type,
      supplierCode: this.editProcessForm.type === 2
        ? (this.editProcessForm.supplierCode.trim() || null) : null
    };

    this.http.put<any>(`${this.apiUrl}/${item.code}/processes/${process.seq}`, payload).subscribe({
      next: (updatedItem) => {
        item.processes = (updatedItem.processes ?? updatedItem.Processes).map((p: any) => ({
          seq:          p.seq          ?? p.Seq,
          code:         p.code         ?? p.Code,
          type:         p.type         ?? p.Type,
          supplierCode: p.supplierCode ?? p.SupplierCode ?? null
        }));
        this.editingProcessSeq  = null;
        this.editingProcessItem = null;
        this.cdr.detectChanges();
      },
      error: (err) => { alert('Failed to update process.'); console.error(err); }
    });
  }

  onEditProcessCancel(): void {
    this.editingProcessSeq  = null;
    this.editingProcessItem = null;
  }

  // ════════════════════════════════════════
  // PROCESS DELETE — DELETE /api/Item/{code}/processes/{seq}
  // ════════════════════════════════════════
  deleteProcess(item: Item, process: Process): void {
    if (!confirm(`Delete process "${process.code}"?`)) return;

    this.http.delete<any>(`${this.apiUrl}/${item.code}/processes/${process.seq}`).subscribe({
      next: (updatedItem) => {
        item.processes = (updatedItem.processes ?? updatedItem.Processes).map((p: any) => ({
          seq:          p.seq          ?? p.Seq,
          code:         p.code         ?? p.Code,
          type:         p.type         ?? p.Type,
          supplierCode: p.supplierCode ?? p.SupplierCode ?? null
        }));
        if (this.editingProcessSeq === process.seq && this.editingProcessItem === item) {
          this.editingProcessSeq  = null;
          this.editingProcessItem = null;
        }
        this.cdr.detectChanges();
      },
      error: (err) => { alert('Failed to delete process.'); console.error(err); }
    });
  }

  // ════════════════════════════════════════
  // BULK UPDATE MODAL (existing)
  // PUT /api/Item/{code}/processes  per item
  // ════════════════════════════════════════
  openBulkUpdate(): void {
    this.bulkEditItems       = JSON.parse(JSON.stringify(this.items.filter(i => i.selected)));
    this.showBulkUpdateModal = true;
  }

  addProcessToBulkItem(item: any): void {
    item.processes.push({ seq: item.processes.length + 1, code: '', type: 1, supplierCode: '' });
  }

  removeProcessFromBulkItem(item: any, index: number): void {
    item.processes.splice(index, 1);
    item.processes.forEach((p: any, i: number) => p.seq = i + 1);
  }

  insertProcessInBulkItem(item: any, index: number): void {
    item.processes.splice(index + 1, 0, { seq: 0, code: '', type: 1, supplierCode: '' });
    item.processes.forEach((p: any, i: number) => p.seq = i + 1);
  }

  applyBulkProcessUpdate(): void {
    if (!confirm(`Save changes to all ${this.bulkEditItems.length} items?`)) return;

    const requests = this.bulkEditItems.map(editedItem =>
      this.http.put<any>(
        `${this.apiUrl}/${editedItem.code}/processes`,
        editedItem.processes
      ).toPromise()
    );

    Promise.all(requests).then(results => {
      results.forEach((updatedItem: any) => {
        const mainItem = this.items.find(i =>
          i.code === (updatedItem.code ?? updatedItem.Code));
        if (mainItem) {
          mainItem.processes = (updatedItem.processes ?? updatedItem.Processes).map((p: any) => ({
            seq:          p.seq          ?? p.Seq,
            code:         p.code         ?? p.Code,
            type:         p.type         ?? p.Type,
            supplierCode: p.supplierCode ?? p.SupplierCode ?? null
          }));
        }
      });
      this.showBulkUpdateModal = false;
      this.clearSelection();
      this.cdr.detectChanges();
    }).catch(err => {
      alert('One or more updates failed.');
      console.error(err);
    });
  }

  // ════════════════════════════════════════
  // BULK ADD MODAL (new)
  // POST /api/Item/bulk
  // ════════════════════════════════════════

  openBulkAddModal(): void {
    this.bulkAddItems  = [];
    this.bulkAddError  = '';
    this.bulkAddSaving = false;
    this.bulkAddNextId = 1;
    this.addBulkDraftItem();          // start with one blank item row
    this.showBulkAddModal = true;
  }

  addBulkDraftItem(): void {
    this.bulkAddItems.push({
      id:        this.bulkAddNextId++,
      code:      '',
      badge:     '',
      processes: [this.emptyDraftProcess()]
    });
  }

  removeBulkDraftItem(id: number): void {
    this.bulkAddItems = this.bulkAddItems.filter(i => i.id !== id);
  }

  onBulkItemCodeChange(item: DraftItem): void {
    item.badge = item.code.trim()
      ? item.code.trim().charAt(0).toUpperCase()
      : '';
  }

  addProcessToDraftItem(item: DraftItem): void {
    item.processes.push(this.emptyDraftProcess());
  }

  removeProcessFromDraftItem(item: DraftItem, index: number): void {
    item.processes.splice(index, 1);
  }

  private emptyDraftProcess(): DraftProcess {
    return { code: '', type: 1, supplierCode: '' };
  }

  private validateBulkAdd(): string {
    if (!this.bulkAddItems.length)
      return 'Add at least one item.';

    const seenCodes: string[] = [];

    for (const item of this.bulkAddItems) {
      const code = item.code.trim().toUpperCase();

      if (!code)
        return 'All item codes are required.';

      if (seenCodes.includes(code))
        return `Duplicate item code: "${code}".`;
      seenCodes.push(code);

      if (!item.processes.length)
        return `Item "${code}" must have at least one process.`;

      for (let i = 0; i < item.processes.length; i++) {
        const p = item.processes[i];
        if (!p.code.trim())
          return `Process ${i + 1} in item "${code}" is missing a code.`;
        if (p.type === 2 && !p.supplierCode.trim())
          return `Process ${i + 1} in item "${code}" requires a supplier (External).`;
      }
    }
    return '';
  }

  submitBulkAdd(): void {
    this.bulkAddError = this.validateBulkAdd();
    if (this.bulkAddError) return;

    this.bulkAddSaving = true;

    const payload = this.bulkAddItems.map(item => ({
      code: item.code.trim().toUpperCase(),
      processes: item.processes.map((p, i) => ({
        seq:          i + 1,
        code:         p.code.trim().toUpperCase(),
        type:         p.type,
        supplierCode: p.type === 2 ? (p.supplierCode.trim() || null) : null
      }))
    }));

    this.http.post<any[]>(`${this.apiUrl}/bulk`, payload).subscribe({
      next: (createdItems) => {
        const mapped = createdItems.map(i => this.mapItem(i));
        this.items.unshift(...mapped);
        this.bulkAddSaving    = false;
        this.showBulkAddModal = false;
        this.bulkAddItems     = [];
        this.bulkAddError     = '';
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.bulkAddSaving = false;
        this.bulkAddError  = err.status === 409
          ? (err.error?.message ?? 'One or more item codes already exist.')
          : (err.error?.message ?? 'Failed to save. Please try again.');
        console.error(err);
      }
    });
  }

}