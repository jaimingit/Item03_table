import { Component, OnInit, ViewEncapsulation, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Item, Process } from '../../models/item03.model';
import { environment } from '../../../environment/environment.prod';

// Shape of items coming from ITEM01 lookup table
interface Item01Option {
  code: string;
  name: string;   // description / display name from ITEM01
}

// ── Bulk-add draft interfaces ──────────────────────────────────
interface DraftProcess {
  code:         string;
  type:         1 | 2;
  supplierCode: string;
}
interface DraftItem {
  id:        number;
  code:      string;
  badge:     string;
  processes: DraftProcess[];
}

// ── Pending change: edit | insert | delete ─────────────────────
// ADD — add newSeq field to PendingChange interface
interface PendingChange {
  id:            number;
  itemCode:      string;
  changeType:    'edit' | 'insert' | 'delete' | 'reseq'; // MODIFY — add 'reseq'
  seq:           number;
  code:          string;
  processType:   1 | 2;
  supplierCode:  string;
  error:         string;
  supplierError: string;
  newSeq?:       number; // ADD — for sequence change
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

  // private apiUrl = 'http://192.168.80.80//myapi/api/Item';
    private readonly apiUrl = `${environment.apiUrl}/Item`;
  

  searchTerm   = ''; 
  isLoading    = false; 
  errorMessage = '';

  // ── Inline insert form (left panel) ──
  showInsertForm     = false;
  insertSelectedCode = '';        // bound to the ITEM01 dropdown
  item01Options:  Item01Option[] = [];
  item01Loading   = false;
  item01Error     = '';
  insertError     = '';

  editingItemCode: string | null = null;
  editItemForm = { code: '', badge: '' };

  filterProcessType: 'all' | 'internal' | 'external' = 'all';

  // bulk add modal
  showBulkAddModal = false;
  bulkAddItems: DraftItem[] = [];
  bulkAddNextId    = 1;
  bulkAddSaving    = false;
  bulkAddError     = '';

  // kept for potential future use
  showBulkUpdateModal = false;
  bulkEditItems: any[] = [];

  // pending queue
  pendingChanges: PendingChange[] = [];
  pendingNextId = 1;

  items: (Item & { selected?: boolean })[] = [];

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadItems();
    this.loadItem01Options();
  }

  private mapItem(item: any): Item & { selected: boolean } {
    return {
      code:      item.code      ?? item.Code,
      badge:     item.badge     ?? item.Badge ?? (item.code ?? item.Code).charAt(0),
      expanded:  false,
      selected:  false,
      processes: (item.processes ?? item.Processes ?? []).map((p: any) => ({
        seq:          p.seq          ?? p.Seq,
        code:         p.code         ?? p.Code,
        type:         p.type         ?? p.Type,
        supplierCode: p.supplierCode ?? p.SupplierCode ?? null
      }))
    };
  }

  // ════════════════════════════════════════
  // LOAD
  // ════════════════════════════════════════
  loadItems(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.http.get<any[]>(this.apiUrl).subscribe({
      next: (data) => {
        this.items = data.map(i => this.mapItem(i));
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.errorMessage = 'Failed to load items.';
        this.isLoading = false;
        this.cdr.detectChanges();
        console.error(err);
      }
    });
  }

  // ── Filters ──
  get filteredItems(): (Item & { selected?: boolean })[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.items;
    const terms = term.split(',').map(s => s.trim()).filter(Boolean);
    return this.items.filter(item =>
      terms.some(t =>
        item.code.toLowerCase().includes(t) ||
        item.processes.some(p => p.code.toLowerCase().includes(t)) ||
        item.processes.some(p => p.supplierCode?.toLowerCase().includes(t)) ||
        item.processes.some(p => (p.type === 1 ? 'internal' : 'external').includes(t))
      )
    );
  }

  filterProcesses(processes: Process[]): Process[] {
    const term = this.searchTerm?.trim().toLowerCase();
    let filtered = [...processes];
    if (this.filterProcessType === 'internal')  filtered = filtered.filter(p => p.type === 1);
    if (this.filterProcessType === 'external')  filtered = filtered.filter(p => p.type === 2);
    if (term) {
      const terms = term.split(',').map(s => s.trim()).filter(Boolean);
      filtered = filtered.filter(p =>
        terms.some(t =>
          p.code.toLowerCase().includes(t) ||
          p.supplierCode?.toLowerCase().includes(t) ||
          (p.type === 1 ? 'internal' : 'external').includes(t)
        )
      );
    }
    return filtered;
  }

  // ── Counts ──
  get totalCount():           number { return this.items.length; }
  get processCount():         number { return this.items.reduce((s, i) => s + i.processes.length, 0); }
  get supplierCount():        number { return new Set(this.items.flatMap(i => i.processes.map(p => p.supplierCode))).size; }
  get internalProcessCount(): number { return this.items.reduce((s, i) => s + i.processes.filter(p => p.type === 1).length, 0); }
  get externalProcessCount(): number { return this.items.reduce((s, i) => s + i.processes.filter(p => p.type === 2).length, 0); }

  // ════════════════════════════════════════
  // PENDING — core
  // ════════════════════════════════════════

  get totalPendingCount(): number { return this.pendingChanges.length; }

  getPendingCountForItem(item: Item): number {
    return this.pendingChanges.filter(p => p.itemCode === item.code).length;
  }

  // ── EDIT ──
  addPendingEdit(item: Item, process: Process): void {
    const exists = this.pendingChanges.find(
      p => p.itemCode === item.code && p.changeType === 'edit' && p.seq === process.seq
    );
    if (exists) { this.removePending(exists.id); return; }
    this.pendingChanges.push({
      id:            this.pendingNextId++,
      itemCode:      item.code,
      changeType:    'edit',
      seq:           process.seq,
      code:          process.code,
      processType:   process.type as 1 | 2,
      supplierCode:  process.supplierCode ?? '',
      error:         '',
      supplierError: ''
    });
  }

  isPendingEdit(item: Item, process: Process): boolean {
    return this.pendingChanges.some(
      p => p.itemCode === item.code && p.changeType === 'edit' && p.seq === process.seq
    );
  }

  getPendingEdit(item: Item, process: Process): PendingChange | undefined {
    return this.pendingChanges.find(
      p => p.itemCode === item.code && p.changeType === 'edit' && p.seq === process.seq
    );
  }

  clearPendingError(item: Item, process: Process): void {
    const p = this.getPendingEdit(item, process); if (p) p.error = '';
  }
  clearPendingSupplierError(item: Item, process: Process): void {
    const p = this.getPendingEdit(item, process); if (p) p.supplierError = '';
  }

  // ── INSERT (before a seq, or at end when seq = null → stored as 0) ──
  /**
   * seq = process.seq  → new row appears BEFORE that process (process shifts down)
   * seq = null         → new row appears at end
   */
  addPendingInsert(item: Item, beforeSeq: number | null): void {
    this.pendingChanges.push({
      id:            this.pendingNextId++,
      itemCode:      item.code,
      changeType:    'insert',
      seq:           beforeSeq ?? 0,
      code:          '',
      processType:   1,
      supplierCode:  '',
      error:         '',
      supplierError: ''
    });
  }

  /** Returns insert-pending rows whose beforeSeq matches */
  getPendingInsertsBefore(item: Item, beforeSeq: number | null): PendingChange[] {
    const target = beforeSeq ?? 0;
    return this.pendingChanges.filter(
      p => p.itemCode === item.code && p.changeType === 'insert' && p.seq === target
    );
  }

  // ── DELETE ──
  togglePendingDelete(item: Item, process: Process): void {
    const exists = this.pendingChanges.find(
      p => p.itemCode === item.code && p.changeType === 'delete' && p.seq === process.seq
    );
    if (exists) {
      this.removePending(exists.id);
    } else {
      // Also remove any pending edit for this process
      const editPending = this.pendingChanges.find(
        p => p.itemCode === item.code && p.changeType === 'edit' && p.seq === process.seq
      );
      if (editPending) this.removePending(editPending.id);

      this.pendingChanges.push({
        id:            this.pendingNextId++,
        itemCode:      item.code,
        changeType:    'delete',
        seq:           process.seq,
        code:          process.code,
        processType:   process.type as 1 | 2,
        supplierCode:  '',
        error:         '',
        supplierError: ''
      });
    }
  }

  isPendingDelete(item: Item, process: Process): boolean {
    return this.pendingChanges.some(
      p => p.itemCode === item.code && p.changeType === 'delete' && p.seq === process.seq
    );
  }
  // ADD — inside the class, after isPendingDelete()

addPendingReseq(item: Item, process: Process, newSeq: number): void {
  // Remove existing reseq for same process if any
  this.pendingChanges = this.pendingChanges.filter(
    p => !(p.itemCode === item.code && p.changeType === 'reseq' && p.seq === process.seq)
  );
  // If newSeq same as current, do nothing
  if (newSeq === process.seq || isNaN(newSeq)) return;
  this.pendingChanges.push({
    id:            this.pendingNextId++,
    itemCode:      item.code,
    changeType:    'reseq',
    seq:           process.seq,
    newSeq:        newSeq,
    code:          process.code,
    processType:   process.type as 1 | 2,
    supplierCode:  process.supplierCode ?? '',
    error:         '',
    supplierError: ''
  });
}

isPendingReseq(item: Item, process: Process): boolean {
  return this.pendingChanges.some(
    p => p.itemCode === item.code && p.changeType === 'reseq' && p.seq === process.seq
  );
}

getPendingReseq(item: Item, process: Process): PendingChange | undefined {
  return this.pendingChanges.find(
    p => p.itemCode === item.code && p.changeType === 'reseq' && p.seq === process.seq
  );
}

getReseqValue(item: Item, process: Process): number {
  const r = this.getPendingReseq(item, process);
  return r ? r.newSeq! : process.seq;
}

// MODIFY — replace onSeqInputChange method
onSeqInputChange(item: Item, process: Process, value: string): void {
  const newSeq = parseInt(value, 10);
  const max = item.processes.length;

  // ADD — clear any existing seq error first
  const existing = this.getPendingReseq(item, process);
  if (existing) existing.error = '';

  // ADD — validate range
  if (isNaN(newSeq) || newSeq < 1 || newSeq > max) {
    // Remove valid reseq if exists
    this.pendingChanges = this.pendingChanges.filter(
      p => !(p.itemCode === item.code && p.changeType === 'reseq' && p.seq === process.seq)
    );
    // ADD — push an error-only reseq entry to show error in UI
    this.pendingChanges.push({
      id:            this.pendingNextId++,
      itemCode:      item.code,
      changeType:    'reseq',
      seq:           process.seq,
      newSeq:        undefined,
      code:          process.code,
      processType:   process.type as 1 | 2,
      supplierCode:  process.supplierCode ?? '',
      error:         `Enter a number between 1 and ${max}.`,
      supplierError: ''
    });
    this.cdr.detectChanges();
    return;
  }

  // Valid — proceed normally
  this.addPendingReseq(item, process, newSeq);
}
// ADD — after onSeqInputChange
hasSeqError(item: Item, process: Process): boolean {
  const r = this.getPendingReseq(item, process);
  return !!r?.error;
}

getSeqError(item: Item, process: Process): string {
  return this.getPendingReseq(item, process)?.error ?? '';
}



  // ── REMOVE / DISCARD ──
  removePending(id: number): void {
    this.pendingChanges = this.pendingChanges.filter(p => p.id !== id);
  }

  discardAllPendingGlobal(): void { this.pendingChanges = []; }



  // ════════════════════════════════════════
  // VALIDATE
  // ════════════════════════════════════════
  private validatePending(changes: PendingChange[], item: Item): boolean {
    let valid = true;

    const editSeqs   = changes.filter(c => c.changeType === 'edit').map(c => c.seq);
    const deleteSeqs = changes.filter(c => c.changeType === 'delete').map(c => c.seq);

    const existingCodes = item.processes
      .filter(p => !editSeqs.includes(p.seq) && !deleteSeqs.includes(p.seq))
      .map(p => p.code.toUpperCase());

    const pendingCodes: string[] = [];

    for (const c of changes) {
      c.error = ''; c.supplierError = '';

      if (c.changeType === 'delete') continue; // delete rows need no validation

      if (!c.code.trim()) {
        c.error = 'Process code is required.';
        valid = false; continue;
      }

      const upper = c.code.trim().toUpperCase();

      if (pendingCodes.includes(upper)) {
        c.error = `Duplicate code "${upper}" in pending list.`;
        valid = false;
      }

      if (c.changeType === 'insert' && existingCodes.includes(upper)) {
        c.error = `Process "${upper}" already exists.`;
        valid = false;
      }

      pendingCodes.push(upper);

      if (c.processType === 2 && !c.supplierCode.trim()) {
        c.supplierError = 'Supplier code required for External.';
        valid = false;
      }
    }
    return valid;
  }

  // ════════════════════════════════════════
  // SAVE ALL GLOBAL
  // ════════════════════════════════════════
  saveAllPendingGlobal(): void {
    // ADD — block save if any reseq has an error
  const hasSeqErrors = this.pendingChanges.some(
    p => p.changeType === 'reseq' && p.error
  );
  if (hasSeqErrors) {
    alert('Please fix sequence number errors before saving.');
    return;
  }

    const itemCodes = [...new Set(this.pendingChanges.map(p => p.itemCode))];

    let allValid = true;
    for (const code of itemCodes) {
      const item    = this.items.find(i => i.code === code);
      const changes = this.pendingChanges.filter(p => p.itemCode === code);
      if (item && !this.validatePending(changes, item)) allValid = false;
    }
    if (!allValid) { this.cdr.detectChanges(); return; }

    const savePromises = itemCodes.map(code => {
      const item    = this.items.find(i => i.code === code)!;
      const changes = this.pendingChanges.filter(p => p.itemCode === code);
      return this.saveChangesForItem(item, changes);
    });

    Promise.all(savePromises)
      .then(() => { this.pendingChanges = []; this.loadItems(); })
      .catch(err => { alert('One or more saves failed.'); console.error(err); this.cdr.detectChanges(); });
  }

  // ════════════════════════════════════════
  // EXECUTE SAVES FOR ONE ITEM — atomic rewrite
  //
  // Strategy: compute the full desired process list in memory, then send
  // it as a single PUT /processes (bulk replace). This avoids the seq-drift
  // problem that occurs when individual POSTs re-number rows between calls.
  // ════════════════════════════════════════
  // MODIFY — inside saveChangesForItem, update the deleteSeqs/editMap block

private async saveChangesForItem(item: Item, changes: PendingChange[]): Promise<void> {
  const deleteSeqs = new Set(
    changes.filter(c => c.changeType === 'delete').map(c => c.seq)
  );
  const editMap = new Map(
    changes.filter(c => c.changeType === 'edit').map(c => [c.seq, c])
  );
  const inserts = changes.filter(c => c.changeType === 'insert');

  // ADD — build reseq map: origSeq → newSeq
 // MODIFY — update reseqMap build to skip error entries
const reseqMap = new Map(
  changes
    .filter(c => c.changeType === 'reseq' && !c.error && c.newSeq !== undefined) // ADD — skip errors
    .map(c => [c.seq, c.newSeq!])
);

  type Row = { code: string; type: 1 | 2; supplierCode: string | null };

  const base: { origSeq: number; row: Row }[] = item.processes
    .filter(p => !deleteSeqs.has(p.seq))
    .map(p => {
      const edit = editMap.get(p.seq);
      return {
        origSeq: p.seq,
        row: edit
          ? { code: edit.code.trim().toUpperCase(), type: edit.processType,
              supplierCode: edit.processType === 2 ? (edit.supplierCode.trim() || null) : null }
          : { code: p.code, type: p.type as 1 | 2,
              supplierCode: p.supplierCode ?? null }
      };
    });

  // ADD — apply reseq: move rows to their new positions
  let reordered = [...base];
  reseqMap.forEach((newSeq, origSeq) => {
    const fromIdx = reordered.findIndex(r => r.origSeq === origSeq);
    if (fromIdx === -1) return;
    const [moved] = reordered.splice(fromIdx, 1);
    const toIdx = Math.min(Math.max(newSeq - 1, 0), reordered.length);
    reordered.splice(toIdx, 0, moved);
  });

  // rest of inserts logic stays same — MODIFY base → reordered
  const sortedInserts = [...inserts].sort((a, b) => {
    if (a.seq === 0) return 1;
    if (b.seq === 0) return -1;
    return a.seq - b.seq;
  });

  const working: { origSeq: number; row: Row }[] = [...reordered]; // MODIFY was [...base]

  for (const ins of sortedInserts) {
    const newRow: Row = {
      code:         ins.code.trim().toUpperCase(),
      type:         ins.processType,
      supplierCode: ins.processType === 2 ? (ins.supplierCode.trim() || null) : null
    };
    if (ins.seq === 0) {
      working.push({ origSeq: -1, row: newRow });
    } else {
      const idx = working.findIndex(w => w.origSeq === ins.seq);
      if (idx !== -1) {
        working.splice(idx, 0, { origSeq: -1, row: newRow });
      } else {
        working.push({ origSeq: -1, row: newRow });
      }
    }
  }

  const payload = working.map(w => ({
    code:         w.row.code,
    type:         w.row.type,
    supplierCode: w.row.supplierCode
  }));

  const updated = await this.http.put<any>(
    `${this.apiUrl}/${item.code}/processes`, payload
  ).toPromise();

  if (updated) {
    item.processes = (updated.processes ?? updated.Processes ?? []).map((p: any) => ({
      seq:          p.seq          ?? p.Seq,
      code:         p.code         ?? p.Code,
      type:         p.type         ?? p.Type,
      supplierCode: p.supplierCode ?? p.SupplierCode ?? null
    }));
  }
}

  // ════════════════════════════════════════
  // LOAD ITEM01 OPTIONS (for insert dropdown)
  // ════════════════════════════════════════
    private loadItem01Options(): void {
    this.item01Loading = true;
    this.item01Error   = '';
    this.http.get<any[]>(`${this.apiUrl}/item01list?lookup=true`).subscribe({
      next: (data) => {
        console.log('ITEM01 options loaded:', data);
        this.item01Options = data.map(d => ({
          code: (d.code ?? d.Code ?? '').toString().trim().toUpperCase(),
          name: (d.name ?? d.Name ?? '').toString().trim()
        })).filter(o => o.code);
        this.item01Loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.item01Error = `Could not load items (HTTP ${err.status}).`;
        this.item01Loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  /** Badge letter for the currently selected code */
  get insertBadge(): string {
    return this.insertSelectedCode ? this.insertSelectedCode.charAt(0).toUpperCase() : '';
  }

  /** True if code already exists in the working list */
  isItemAlreadyAdded(code: string): boolean {
    return this.items.some(i => i.code.toUpperCase() === code.toUpperCase());
  }

  // ════════════════════════════════════════
  // SELECTION
  // ════════════════════════════════════════
  getSelectedCount(): number  { return this.items.filter(i => i.selected).length; }
  isAllSelected():    boolean { return this.items.length > 0 && this.items.every(i => i.selected); }
  toggleAllSelection(event: any): void { this.filteredItems.forEach(i => i.selected = event.target.checked); }
  clearSelection(): void { this.items.forEach(i => i.selected = false); }

  toggleProcess(item: any): void {
    const open = item.expanded;
    this.items.forEach(i => i.expanded = false);
    if (!open) item.expanded = true;
  }

  // ════════════════════════════════════════
  // ITEM INSERT (inline form with dropdown)
  // ════════════════════════════════════════
  openInsertForm(): void {
    this.editingItemCode   = null;
    this.insertSelectedCode = '';
    this.insertError        = '';
    this.showInsertForm     = true;
  }

  onInsertSave(): void {
    const code = this.insertSelectedCode.trim().toUpperCase();
    if (!code) { this.insertError = 'Please select an item.'; return; }
    if (this.items.some(i => i.code.toUpperCase() === code)) {
      this.insertError = `Item "${code}" already exists.`;
      return;
    }
    this.http.post<any>(this.apiUrl, { code, badge: code.charAt(0), expanded: false, processes: [] }).subscribe({
      next: () => {
        this.showInsertForm     = false;
        this.insertSelectedCode = '';
        this.insertError        = '';
        this.loadItems();
      },
      error: (err) => {
        this.insertError = err.status === 409
          ? `Item "${code}" already exists.`
          : (err.error?.message ?? 'Failed to create item.');
        this.cdr.detectChanges();
      }
    });
  }

  onInsertCancel(): void {
    this.showInsertForm     = false;
    this.insertSelectedCode = '';
    this.insertError        = '';
  }

  // ════════════════════════════════════════
  // ITEM EDIT
  // ════════════════════════════════════════
  openEditForm(item: Item): void {
    this.showInsertForm     = false;
    this.insertSelectedCode = '';
    this.insertError        = '';
    if (this.editingItemCode === item.code) { this.editingItemCode = null; }
    else { this.editingItemCode = item.code; this.editItemForm = { code: item.code, badge: item.badge }; }
  }
  isEditing(item: Item): boolean { return this.editingItemCode === item.code; }
  onEditItemCodeChange(): void {
    this.editItemForm.badge = this.editItemForm.code ? this.editItemForm.code.charAt(0).toUpperCase() : '';
  }
  onEditSave(item: Item): void {
    const code = this.editItemForm.code.trim().toUpperCase();
    if (!code) return;
    if (code !== item.code && this.items.some(i => i.code.toUpperCase() === code)) { alert(`Item "${code}" already exists.`); return; }
    if (code !== item.code && !confirm(`Change item code from "${item.code}" to "${code}"?`)) return;
    this.http.put<any>(`${this.apiUrl}/${item.code}`, { code, badge: code.charAt(0) }).subscribe({
      next: () => {
        this.pendingChanges = this.pendingChanges.filter(p => p.itemCode !== item.code);
        this.editingItemCode = null;
        this.loadItems();
      },
      error: (err) => { alert(err.status === 409 ? `Item "${code}" already exists.` : 'Failed to update item.'); }
    });
  }
  onEditCancel(): void { this.editingItemCode = null; }

  // ════════════════════════════════════════
  // ITEM DELETE
  // ════════════════════════════════════════
  deleteItem(item: Item): void {
    if (!confirm(`Delete item "${item.code}" and all its processes?`)) return;
    this.http.delete(`${this.apiUrl}/${item.code}`).subscribe({
      next: () => {
        this.pendingChanges = this.pendingChanges.filter(p => p.itemCode !== item.code);
        if (this.editingItemCode === item.code) this.editingItemCode = null;
        this.loadItems();
      },
      error: () => alert('Failed to delete item.')
    });
  }

  deleteAllItems(): void {
    if (!confirm('Delete ALL items?')) return;
    this.http.delete(this.apiUrl).subscribe({
      next: () => {
        this.pendingChanges  = [];
        this.showInsertForm  = false;
        this.editingItemCode = null;
        this.loadItems();
      },
      error: () => alert('Failed to delete all items.')
    });
  }

  deleteSelectedItems(): void {
    if (!confirm(`Delete all ${this.getSelectedCount()} selected items?`)) return;
    const selected = this.items.filter(i => i.selected);
    const removedCodes = selected.map(i => i.code);
    Promise.all(selected.map(i => this.http.delete(`${this.apiUrl}/${i.code}`).toPromise()))
      .then(() => {
        this.pendingChanges = this.pendingChanges.filter(p => !removedCodes.includes(p.itemCode));
        this.loadItems();
      })
      .catch(() => alert('Failed to delete one or more items.'));
  }

  // ════════════════════════════════════════
  // BULK ADD MODAL
  // ════════════════════════════════════════
  openBulkAddModal(): void {
    this.bulkAddItems = []; this.bulkAddError = ''; this.bulkAddSaving = false; this.bulkAddNextId = 1;
    this.addBulkDraftItem();
    this.showBulkAddModal = true;
  }
  addBulkDraftItem(): void {
    this.bulkAddItems.push({ id: this.bulkAddNextId++, code: '', badge: '', processes: [this.emptyDraftProcess()] });
  }
  removeBulkDraftItem(id: number): void { this.bulkAddItems = this.bulkAddItems.filter(i => i.id !== id); }
  onBulkItemCodeChange(item: DraftItem): void { item.badge = item.code.trim() ? item.code.trim().charAt(0).toUpperCase() : ''; }
  addProcessToDraftItem(item: DraftItem): void { item.processes.push(this.emptyDraftProcess()); }
  removeProcessFromDraftItem(item: DraftItem, index: number): void { item.processes.splice(index, 1); }
  private emptyDraftProcess(): DraftProcess { return { code: '', type: 1, supplierCode: '' }; }

  private validateBulkAdd(): string {
    if (!this.bulkAddItems.length) return 'Add at least one item.';
    const seen: string[] = [];
    for (const item of this.bulkAddItems) {
      const code = item.code.trim().toUpperCase();
      if (!code) return 'All item codes are required.';
      if (seen.includes(code)) return `Duplicate item code: "${code}".`;
      seen.push(code);
      if (this.items.some(i => i.code.toUpperCase() === code)) return `Item "${code}" already exists.`;
      for (let i = 0; i < item.processes.length; i++) {
        const p = item.processes[i];
        if (!p.code.trim()) return `Process ${i+1} in item "${code}" is missing a code.`;
        if (p.type === 2 && !p.supplierCode.trim()) return `Process ${i+1} in item "${code}" requires a supplier (External).`;
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
        seq: i+1, code: p.code.trim().toUpperCase(), type: p.type,
        supplierCode: p.type === 2 ? (p.supplierCode.trim() || null) : null
      }))
    }));
    this.http.post<any[]>(`${this.apiUrl}/bulk`, payload).subscribe({
      next: () => {
        this.bulkAddSaving   = false;
        this.showBulkAddModal = false;
        this.bulkAddItems    = [];
        this.bulkAddError    = '';
        this.loadItems();
      },
      error: (err) => {
        this.bulkAddSaving = false;
        this.bulkAddError = err.status === 409
          ? (err.error?.message ?? 'One or more item codes already exist.')
          : (err.error?.message ?? 'Failed to save. Please try again.');
      }
    });
  }

  // kept for template compatibility
  openBulkUpdate(): void { this.bulkEditItems = JSON.parse(JSON.stringify(this.items.filter(i => i.selected))); this.showBulkUpdateModal = true; }
  addProcessToBulkItem(item: any): void { item.processes.push({ seq: item.processes.length+1, code: '', type: 1, supplierCode: '' }); }
  removeProcessFromBulkItem(item: any, index: number): void { item.processes.splice(index,1); item.processes.forEach((p:any,i:number)=>p.seq=i+1); }
  insertProcessInBulkItem(item: any, index: number): void { item.processes.splice(index+1,0,{seq:0,code:'',type:1,supplierCode:''}); item.processes.forEach((p:any,i:number)=>p.seq=i+1); }
  applyBulkProcessUpdate(): void {
    Promise.all(this.bulkEditItems.map(e => this.http.put<any>(`${this.apiUrl}/${e.code}/processes`, e.processes).toPromise()))
      .then(results => {
        results.forEach((u:any) => {
          const m = this.items.find(i => i.code===(u.code??u.Code));
          if (m) m.processes=(u.processes??u.Processes).map((p:any)=>({seq:p.seq??p.Seq,code:p.code??p.Code,type:p.type??p.Type,supplierCode:p.supplierCode??p.SupplierCode??null}));
        });
        this.showBulkUpdateModal=false; this.clearSelection(); this.cdr.detectChanges();
      }).catch(()=>alert('One or more updates failed.'));
  }
}