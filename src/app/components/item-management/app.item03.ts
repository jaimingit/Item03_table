import { Component, OnInit, ViewEncapsulation, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
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

// ADD — Toast interface
interface Toast {
  id:      number;
  type:    'success' | 'error' | 'warning' | 'info';
  message: string;
  icon:    string;
}

// ── Bulk-add draft interfaces ──────────────────────────────────
interface DraftProcess {
  code: string;
  type: 1 | 2;
  supplierCode: string;
}
interface DraftItem {
  id: number;
  code: string;
  badge: string;
  processes: DraftProcess[];
}

// ── Pending change: edit | insert | delete ─────────────────────
// ADD — add newSeq field to PendingChange interface
interface PendingChange {
  id: number;
  itemCode: string;
  changeType: 'edit' | 'insert' | 'delete' | 'reseq'; // MODIFY — add 'reseq'
  seq: number;
  code: string;
  processType: 1 | 2;
  supplierCode: string;
  error: string;
  supplierError: string;
  newSeq?: number; // ADD — for sequence change
}

// ADD — ConfirmDialog interface
interface ConfirmDialog {
  title:         string;
  message:       string;
  confirmLabel:  string;
  cancelLabel:   string;
  danger:        boolean;
  onConfirm:     () => void;
}

// ADD — pagination state for ITEM01 list
interface Item01DropdownResponse {
  data: Item01Option[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ADD — pagination state for ITEM03 processes
interface Item03ProcessResponse {
  itemCode: string;
  data: Process[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  totalPages: number;
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

  private readonly baseApiUrl = 'http://localhost:5254/api';
  private readonly apiUrl = `${this.baseApiUrl}/Item`;

  searchTerm = ''; 
  isLoading = false;
  errorMessage = '';
private item01SearchDebounce: any = null;

  // ── Inline insert form (left panel) ──
  showInsertForm = false;
  insertSelectedCode = '';        // bound to the ITEM01 dropdown
  item01Options: Item01Option[] = [];
  item01DropdownLoading = false;
  item01Error = '';
  insertError = '';
// Per-item save errors
itemSaveErrors = new Map<string, string>();
  // ADD — ITEM01 pagination state
   item01Page = 1;
   item01PageSize = 20;
   item01SearchTerm = '';
  item01HasMore = false;

  

  editingItemCode: string | null = null;
  editItemForm = { code: '', badge: '' };

  filterProcessType: 'all' | 'internal' | 'external' = 'all';

  // bulk add modal
  showBulkAddModal = false;
  bulkAddItems: DraftItem[] = [];
  bulkAddNextId = 1;
  bulkAddSaving = false;
  bulkAddError = '';

  // kept for potential future use
  showBulkUpdateModal = false;
  bulkEditItems: any[] = [];

  // pending queue
  pendingChanges: PendingChange[] = [];
  pendingNextId = 1;

  items: (Item & { selected?: boolean })[] = [];

  // ADD — toast state
  toasts: Toast[] = [];
  private toastNextId = 1;

  // ADD — confirm dialog state
  confirmDialog: ConfirmDialog | null = null;

  // ADD — process pagination state per item (itemCode → currentPage)
  processPages = new Map<string, number>();
  processPageSize = 20;

  // ADD — ITEM03 processes cache per item
  processCache = new Map<string, Item03ProcessResponse>();
  processLoading = new Map<string, boolean>();

  @ViewChild('dropdownContainer', { read: ElementRef }) dropdownContainer?: ElementRef;

  readonly Math = Math;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.loadItems();
    this.loadItem01DropdownInitial();
  }

  private mapItem(item: any): Item & { selected: boolean } {
    return {
      code: item.code ?? item.Code,
      badge: item.badge ?? item.Badge ?? (item.code ?? item.Code).charAt(0),
      expanded: false,
      selected: false,
      processes: (item.processes ?? item.Processes ?? []).map((p: any) => ({
        seq: p.seq ?? p.Seq,
        code: p.code ?? p.Code,
        type: p.type ?? p.Type,
        supplierCode: p.supplierCode ?? p.SupplierCode ?? null
      }))
    };
  }

  // ════════════════════════════════════════
  // TOAST NOTIFICATIONS
  // ════════════════════════════════════════
  showToast(type: Toast['type'], message: string): void {
    const icons = {
      success: 'bi-check-circle-fill',
      error:   'bi-x-circle-fill',
      warning: 'bi-exclamation-triangle-fill',
      info:    'bi-info-circle-fill'
    };
    const toast: Toast = {
      id:      this.toastNextId++,
      type,
      message,
      icon:    icons[type]
    };
    this.toasts.push(toast);
    setTimeout(() => this.removeToast(toast.id), 3500);
    this.cdr.detectChanges();
  }

  removeToast(id: number): void {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.cdr.detectChanges();
  }

  // ════════════════════════════════════════
  // CONFIRM DIALOG
  // ════════════════════════════════════════
  showConfirm(options: ConfirmDialog): void {
    this.confirmDialog = options;
    this.cdr.detectChanges();
  }

  onConfirmYes(): void {
    if (this.confirmDialog) {
      this.confirmDialog.onConfirm();
      this.confirmDialog = null;
      this.cdr.detectChanges();
    }
  }

  onConfirmNo(): void {
    this.confirmDialog = null;
    this.cdr.detectChanges();
  }

  // per item error show 
  getItemSaveError(itemCode: string): string {
  return this.itemSaveErrors.get(itemCode) ?? '';
}

hasItemSaveError(itemCode: string): boolean {
  return this.itemSaveErrors.has(itemCode);
}

clearItemSaveError(itemCode: string): void {
  this.itemSaveErrors.delete(itemCode);
  this.cdr.detectChanges();
}

getPendingSummary(itemCode: string): string {
  const changes = this.pendingChanges.filter(p => p.itemCode === itemCode);
  const edits   = changes.filter(c => c.changeType === 'edit').length;
  const inserts = changes.filter(c => c.changeType === 'insert').length;
  const deletes = changes.filter(c => c.changeType === 'delete').length;
  const reseqs  = changes.filter(c => c.changeType === 'reseq').length;
  const parts: string[] = [];
  if (inserts) parts.push(`${inserts} add`);
  if (edits)   parts.push(`${edits} edit`);
  if (deletes) parts.push(`${deletes} delete`);
  if (reseqs)  parts.push(`${reseqs} reseq`);
  return parts.join(', ');
}

discardPendingForItem(itemCode: string): void {
  this.pendingChanges = this.pendingChanges.filter(p => p.itemCode !== itemCode);
  this.itemSaveErrors.delete(itemCode);
  this.cdr.detectChanges();
}

  // ════════════════════════════════════════
  // LOAD ITEMS (ITEM03 — grouped view)
  // ════════════════════════════════════════
  loadItems(): void {
    this.isLoading = true;
    this.errorMessage = '';

    // Remember which items were expanded before reload
    const expandedCodes = new Set(
      this.items.filter(i => i.expanded).map(i => i.code)
    );

    setTimeout(() => {
      this.http.get<any[]>(this.apiUrl).subscribe({
        next: (data) => {
          this.items = data.map(i => {
            const mapped = this.mapItem(i);
            mapped.expanded = expandedCodes.has(mapped.code);
            return mapped;
          });
          // ADD — clear process cache on reload
          this.processCache.clear();
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
    }, 1000);
  }

  // ──────────────────────────────────────────────
  // LOAD ITEM01 DROPDOWN (Initial)
  // ──────────────────────────────────────────────
  private loadItem01DropdownInitial(): void {
    this.item01Page = 1;
    this.item01SearchTerm = '';
    this.loadItem01DropdownPage();
  }

  // ──────────────────────────────────────────────
  // Load ITEM01 dropdown with pagination & search
  // ──────────────────────────────────────────────
  private loadItem01DropdownPage(): void {
    this.item01DropdownLoading = true;
    this.item01Error = '';

    const params = new URLSearchParams({
      page: this.item01Page.toString(),
      pageSize: this.item01PageSize.toString(),
      search: this.item01SearchTerm || ''
    });

    // ✅ FIXED — backend route is /api/Item01/dropdown
    const url = `${this.baseApiUrl}/Item01/dropdown?${params.toString()}`;

    this.http.get<Item01DropdownResponse>(url).subscribe({
      next: (response) => {
        // ADD — append new items (for infinite scroll)
        if (this.item01Page === 1) {
          this.item01Options = response.data;
        } else {
          this.item01Options.push(...response.data);
        }

        // ✅ Use backend hasMore field
        this.item01HasMore = response.hasMore ?? false;

        this.item01DropdownLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.item01Error = `Could not load items (HTTP ${err.status}).`;
        this.item01DropdownLoading = false;
        console.error('Item01 dropdown error:', err);
        this.cdr.detectChanges();
      }
    });
  }

  // ──────────────────────────────────────────────
  // Handle dropdown scroll for infinite scroll
  // ──────────────────────────────────────────────
onDropdownScroll(event: Event): void {
  const el = event.target as HTMLElement;
  const nearBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 60;
  if (nearBottom && this.item01HasMore && !this.item01DropdownLoading) {
    this.item01Page++;
    this.loadItem01DropdownPage();
  }
}

  // ──────────────────────────────────────────────
  // Handle dropdown search with debounce
  // ──────────────────────────────────────────────
  onItem01Search(searchTerm: string): void {
  clearTimeout(this.item01SearchDebounce);
  this.item01SearchDebounce = setTimeout(() => {
    this.item01SearchTerm = searchTerm;
    this.item01Page = 1;
    this.item01Options = [];
    this.loadItem01DropdownPage();
  }, 300);
}
  // ════════════════════════════════════════
  // LOAD ITEM03 PROCESSES (Paginated)
  // ════════════════════════════════════════
  // ADD — Load processes for specific item with pagination
private loadProcessesForItem(itemCode: string, page: number = 1): void {
    const cacheKey = `${itemCode}_page${page}`;
    
    // Check cache first
    if (this.processCache.has(cacheKey)) {
      return; // Already cached
    }

  this.processLoading.set(itemCode, false);
    const pageSize = 20; // Default page size for processes

    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString()
    });

    // ✅ FIXED — backend route is /api/Item03/{itemCode}
    const url = `${this.baseApiUrl}/Item03/${itemCode}?${params.toString()}`;

    this.http.get<Item03ProcessResponse>(url).subscribe({
      next: (response) => {
        // Store in cache
        this.processCache.set(cacheKey, response);
        
        // Update the item's processes in memory
        const item = this.items.find(i => i.code === itemCode);
        if (item && page === 1) {
          item.processes = response.data;
        }
        
        this.processLoading.set(itemCode, false);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(`Failed to load processes for ${itemCode}:`, err);
        this.processLoading.set(itemCode, false);
        this.cdr.detectChanges();
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
    if (this.filterProcessType === 'internal') filtered = filtered.filter(p => p.type === 1);
    if (this.filterProcessType === 'external') filtered = filtered.filter(p => p.type === 2);
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
  get totalCount(): number { return this.items.length; }
  get processCount(): number { return this.items.reduce((s, i) => s + i.processes.length, 0); }
  get supplierCount(): number { return new Set(this.items.flatMap(i => i.processes.map(p => p.supplierCode))).size; }
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
      id: this.pendingNextId++,
      itemCode: item.code,
      changeType: 'edit',
      seq: process.seq,
      code: process.code,
      processType: process.type as 1 | 2,
      supplierCode: process.supplierCode ?? '',
      error: '',
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
  addPendingInsert(item: Item, beforeSeq: number | null): void {
    this.pendingChanges.push({
      id: this.pendingNextId++,
      itemCode: item.code,
      changeType: 'insert',
      seq: beforeSeq ?? 0,
      code: '',
      processType: 1,
      supplierCode: '',
      error: '',
      supplierError: ''
    });

    if (beforeSeq === null) {
      const totalFiltered = this.filterProcesses(item.processes).length;
      const endInserts = this.pendingChanges.filter(
        p => p.itemCode === item.code &&
          p.changeType === 'insert' &&
          p.seq === 0
      ).length;

      const totalRows = totalFiltered + endInserts;
      const lastPage = Math.max(1, Math.ceil(totalRows / this.processPageSize));

      this.processPages.set(item.code, lastPage);
    }

    if (beforeSeq !== null) {
      const filtered = this.filterProcesses(item.processes);
      const idx = filtered.findIndex(p => p.seq === beforeSeq);
      if (idx !== -1) {
        const targetPage = Math.ceil((idx + 1) / this.processPageSize);
        this.processPages.set(item.code, targetPage);
      }
    }

    this.cdr.detectChanges();
  }

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
      const editPending = this.pendingChanges.find(
        p => p.itemCode === item.code && p.changeType === 'edit' && p.seq === process.seq
      );
      if (editPending) this.removePending(editPending.id);

      this.pendingChanges.push({
        id: this.pendingNextId++,
        itemCode: item.code,
        changeType: 'delete',
        seq: process.seq,
        code: process.code,
        processType: process.type as 1 | 2,
        supplierCode: '',
        error: '',
        supplierError: ''
      });
    }
  }

  isPendingDelete(item: Item, process: Process): boolean {
    return this.pendingChanges.some(
      p => p.itemCode === item.code && p.changeType === 'delete' && p.seq === process.seq
    );
  }

  // ── RESEQUENCE ──
  addPendingReseq(item: Item, process: Process, newSeq: number): void {
    this.pendingChanges = this.pendingChanges.filter(
      p => !(p.itemCode === item.code && p.changeType === 'reseq' && p.seq === process.seq)
    );
    if (newSeq === process.seq || isNaN(newSeq)) return;
    this.pendingChanges.push({
      id: this.pendingNextId++,
      itemCode: item.code,
      changeType: 'reseq',
      seq: process.seq,
      newSeq: newSeq,
      code: process.code,
      processType: process.type as 1 | 2,
      supplierCode: process.supplierCode ?? '',
      error: '',
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

  onSeqInputChange(item: Item, process: Process, value: string): void {
    const newSeq = parseInt(value, 10);
    const max = item.processes.length;

    const existing = this.getPendingReseq(item, process);
    if (existing) existing.error = '';

    if (isNaN(newSeq) || newSeq < 1 || newSeq > max) {
      this.pendingChanges = this.pendingChanges.filter(
        p => !(p.itemCode === item.code && p.changeType === 'reseq' && p.seq === process.seq)
      );
      this.pendingChanges.push({
        id: this.pendingNextId++,
        itemCode: item.code,
        changeType: 'reseq',
        seq: process.seq,
        newSeq: undefined,
        code: process.code,
        processType: process.type as 1 | 2,
        supplierCode: process.supplierCode ?? '',
        error: `Enter a number between 1 and ${max}.`,
        supplierError: ''
      });
      this.cdr.detectChanges();
      return;
    }

    this.addPendingReseq(item, process, newSeq);
  }

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
discardAllPendingGlobal(): void {
  this.pendingChanges = [];
  this.itemSaveErrors.clear(); // ADD
  this.cdr.detectChanges();
}
get pendingItemCodes(): string[] {
  return [...new Set(this.pendingChanges.map(p => p.itemCode))];
}

  // ════════════════════════════════════════
  // VALIDATE
  // ════════════════════════════════════════
  private validatePending(changes: PendingChange[], item: Item): boolean {
    let valid = true;

    const editSeqs = changes.filter(c => c.changeType === 'edit').map(c => c.seq);
    const deleteSeqs = changes.filter(c => c.changeType === 'delete').map(c => c.seq);

    const existingCodes = item.processes
      .filter(p => !editSeqs.includes(p.seq) && !deleteSeqs.includes(p.seq))
      .map(p => p.code.toUpperCase());

    const pendingCodes: string[] = [];

    for (const c of changes) {
      c.error = ''; c.supplierError = '';

      if (c.changeType === 'delete' || c.changeType === 'reseq') continue;

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
  const hasSeqErrors = this.pendingChanges.some(
    p => p.changeType === 'reseq' && p.error
  );
  if (hasSeqErrors) {
    this.showToast('warning', 'Please fix sequence number errors before saving.');
    return;
  }

  const itemCodes = [...new Set(this.pendingChanges.map(p => p.itemCode))];
  this.itemSaveErrors.clear();

  let allValid = true;
  for (const code of itemCodes) {
    const item = this.items.find(i => i.code === code);
    const changes = this.pendingChanges.filter(p => p.itemCode === code);
    if (item && !this.validatePending(changes, item)) allValid = false;
  }
  if (!allValid) { this.cdr.detectChanges(); return; }

  const results: { code: string; success: boolean; error?: string }[] = [];

  const savePromises = itemCodes.map(async code => {
    const item = this.items.find(i => i.code === code)!;
    const changes = this.pendingChanges.filter(p => p.itemCode === code);
    try {
      await this.saveChangesForItem(item, changes);
      results.push({ code, success: true });
    } catch (err: any) {
      const msg = err?.error?.message
        ?? err?.message
        ?? `Failed to save item "${code}".`;
      results.push({ code, success: false, error: msg });
      this.itemSaveErrors.set(code, msg);
    }
  });

  Promise.all(savePromises).then(() => {
    const failed  = results.filter(r => !r.success);
    const success = results.filter(r => r.success);

    const savedCodes = success.map(r => r.code);
    this.pendingChanges = this.pendingChanges.filter(
      p => !savedCodes.includes(p.itemCode)
    );

    if (failed.length === 0) {
      this.showToast('success', `All ${success.length} item(s) saved successfully.`);
      this.itemSaveErrors.clear();
    } else if (success.length === 0) {
      this.showToast('error', `All ${failed.length} item(s) failed. Check item errors on the left.`);
    } else {
      this.showToast('warning',
        `${success.length} saved, ${failed.length} failed. Check item errors on the left.`
      );
    }

    this.cdr.detectChanges();
  });
}

  // ════════════════════════════════════════
  // EXECUTE SAVES FOR ONE ITEM — atomic rewrite
  // ════════════════════════════════════════
  private async saveChangesForItem(item: Item, changes: PendingChange[]): Promise<void> {
    const deleteSeqs = new Set(
      changes.filter(c => c.changeType === 'delete').map(c => c.seq)
    );
    const editMap = new Map(
      changes.filter(c => c.changeType === 'edit').map(c => [c.seq, c])
    );
    const inserts = changes.filter(c => c.changeType === 'insert');

    const reseqMap = new Map(
      changes
        .filter(c => c.changeType === 'reseq' && !c.error && c.newSeq !== undefined)
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
            ? {
              code: edit.code.trim().toUpperCase(), type: edit.processType,
              supplierCode: edit.processType === 2 ? (edit.supplierCode.trim() || null) : null
            }
            : {
              code: p.code, type: p.type as 1 | 2,
              supplierCode: p.supplierCode ?? null
            }
        };
      });

    let reordered = [...base];
    reseqMap.forEach((newSeq, origSeq) => {
      const fromIdx = reordered.findIndex(r => r.origSeq === origSeq);
      if (fromIdx === -1) return;
      const [moved] = reordered.splice(fromIdx, 1);
      const toIdx = Math.min(Math.max(newSeq - 1, 0), reordered.length);
      reordered.splice(toIdx, 0, moved);
    });

    const sortedInserts = [...inserts].sort((a, b) => {
      if (a.seq === 0) return 1;
      if (b.seq === 0) return -1;
      return a.seq - b.seq;
    });

    const working: { origSeq: number; row: Row }[] = [...reordered];

    for (const ins of sortedInserts) {
      const newRow: Row = {
        code: ins.code.trim().toUpperCase(),
        type: ins.processType,
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
      code: w.row.code,
      type: w.row.type,
      supplierCode: w.row.supplierCode
    }));

    const updated = await this.http.put<any>(
      `${this.apiUrl}/${item.code}/processes`, payload
    ).toPromise().catch((err) => {
  throw err; // re-throw so saveAllPendingGlobal .catch() receives it
});

    if (updated) {
      item.processes = (updated.processes ?? updated.Processes ?? []).map((p: any) => ({
        seq: p.seq ?? p.Seq,
        code: p.code ?? p.Code,
        type: p.type ?? p.Type,
        supplierCode: p.supplierCode ?? p.SupplierCode ?? null
      }));
      // ADD — clear process cache for this item on save
      this.processCache.forEach((value, key) => {
        if (key.startsWith(item.code)) {
          this.processCache.delete(key);
        }
      });
    }
  }

  // ════════════════════════════════════════
  // ITEM INSERT (inline form with dropdown)
  // ════════════════════════════════════════
  openInsertForm(): void {
  this.editingItemCode = null;
  this.insertSelectedCode = '';
  this.insertError = '';
  this.item01SearchTerm = '';
  this.item01Page = 1;
  this.item01Options = [];
  this.showInsertForm = true;
  this.loadItem01DropdownPage();
}

  onInsertSave(): void {
    const code = this.insertSelectedCode.trim().toUpperCase();
    if (!code) { this.insertError = 'Please select an item.'; return; }
    if (this.items.some(i => i.code.toUpperCase() === code)) {
      this.insertError = `Item "${code}" already exists.`;
      return;
    }
    this.http.post<any>(this.apiUrl, { code }).subscribe({
      next: (newItem) => {
        const mapped = this.mapItem(newItem);
        this.items.push(mapped);
        this.showInsertForm = false;
        this.insertSelectedCode = '';
        this.insertError = '';
        this.showToast('success', `Item "${code}" added.`);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.insertError = err.status === 409
          ? `Item "${code}" already exists.`
          : (err.error?.message ?? 'Failed to create item.');
        this.showToast('error', this.insertError);
        this.cdr.detectChanges();
      }
    });
  }

  onInsertCancel(): void {
    this.showInsertForm = false;
    this.insertSelectedCode = '';
    this.insertError = '';
  }

  // ════════════════════════════════════════
  // ITEM EDIT
  // ════════════════════════════════════════
  openEditForm(item: Item): void {
    this.showInsertForm = false;
    this.insertSelectedCode = '';
    this.insertError = '';
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
    this.http.put<any>(`${this.apiUrl}/${item.code}`, { code }).subscribe({
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
    this.showConfirm({
      title:        `Delete "${item.code}"?`,
      message:      `This will permanently delete item "${item.code}" and all its ${item.processes.length} processes.`,
      confirmLabel: 'Delete',
      cancelLabel:  'Cancel',
      danger:       true,
      onConfirm:    () => {
        this.http.delete(`${this.apiUrl}/${item.code}`).subscribe({
          next: () => {
            this.items = this.items.filter(i => i.code !== item.code);
            this.pendingChanges = this.pendingChanges.filter(p => p.itemCode !== item.code);
            if (this.editingItemCode === item.code) this.editingItemCode = null;
            this.showToast('success', `Item "${item.code}" deleted.`);
            this.cdr.detectChanges();
          },
          error: () => this.showToast('error', 'Failed to delete item.')
        });
      }
    });
  }

  deleteAllItems(): void {
    this.showConfirm({
      title:        'Delete ALL Items?',
      message:      `This will permanently delete all ${this.items.length} items and their processes. This cannot be undone.`,
      confirmLabel: 'Delete All',
      cancelLabel:  'Cancel',
      danger:       true,
      onConfirm:    () => {
        this.http.delete(this.apiUrl).subscribe({
          next: () => {
            this.items           = [];
            this.pendingChanges  = [];
            this.showInsertForm  = false;
            this.editingItemCode = null;
            this.showToast('success', 'All items deleted.');
            this.cdr.detectChanges();
          },
          error: () => this.showToast('error', 'Failed to delete all items.')
        });
      }
    });
  }

  deleteSelectedItems(): void {
    const selected = this.items.filter(i => i.selected);
    if (selected.length === 0) return;

    this.showConfirm({
      title:        `Delete ${selected.length} Items?`,
      message:      `This will permanently delete ${selected.length} selected items and all their processes.`,
      confirmLabel: 'Delete Selected',
      cancelLabel:  'Cancel',
      danger:       true,
      onConfirm:    () => {
        const removedCodes = selected.map((i: any) => i.code);
        Promise.all(
          selected.map((i: any) => this.http.delete(`${this.apiUrl}/${i.code}`).toPromise())
        ).then(() => {
          this.items = this.items.filter(i => !removedCodes.includes(i.code));
          this.pendingChanges = this.pendingChanges.filter(p => !removedCodes.includes(p.itemCode));
          this.showToast('success', `${selected.length} items deleted.`);
          this.cdr.detectChanges();
        })
        .catch(() => this.showToast('error', 'Failed to delete one or more items.'));
      }
    });
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
        if (!p.code.trim()) return `Process ${i + 1} in item "${code}" is missing a code.`;
        if (p.type === 2 && !p.supplierCode.trim()) return `Process ${i + 1} in item "${code}" requires a supplier (External).`;
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
        code: p.code.trim().toUpperCase(),
        type: p.type,
        supplierCode: p.type === 2 ? (p.supplierCode.trim() || null) : null
      }))
    }));
    this.http.post<any[]>(`${this.apiUrl}/bulk`, payload).subscribe({
      next: (createdItems: any[]) => {
        createdItems.forEach(newItem => {
          const mapped = this.mapItem(newItem);
          this.items.push(mapped);
        });
        this.bulkAddSaving = false;
        this.showBulkAddModal = false;
        this.bulkAddItems = [];
        this.bulkAddError = '';
        this.showToast('success', 'Items saved successfully.');
        this.cdr.detectChanges();
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
  addProcessToBulkItem(item: any): void { item.processes.push({ seq: item.processes.length + 1, code: '', type: 1, supplierCode: '' }); }
  removeProcessFromBulkItem(item: any, index: number): void { item.processes.splice(index, 1); item.processes.forEach((p: any, i: number) => p.seq = i + 1); }
  insertProcessInBulkItem(item: any, index: number): void { item.processes.splice(index + 1, 0, { seq: 0, code: '', type: 1, supplierCode: '' }); item.processes.forEach((p: any, i: number) => p.seq = i + 1); }
  applyBulkProcessUpdate(): void {
    Promise.all(this.bulkEditItems.map(e => this.http.put<any>(`${this.apiUrl}/${e.code}/processes`, e.processes).toPromise()))
      .then(results => {
        results.forEach((u: any) => {
          const m = this.items.find(i => i.code === (u.code ?? u.Code));
          if (m) m.processes = (u.processes ?? u.Processes).map((p: any) => ({ seq: p.seq ?? p.Seq, code: p.code ?? p.Code, type: p.type ?? p.Type, supplierCode: p.supplierCode ?? p.SupplierCode ?? null }));
        });
        this.showBulkUpdateModal = false; this.clearSelection(); this.cdr.detectChanges();
      }).catch(() => alert('One or more updates failed.'));
  }

  // ════════════════════════════════════════
  // PROCESS PAGINATION (for expanded items)
  // ════════════════════════════════════════
  getProcessPage(itemCode: string): number {
    return this.processPages.get(itemCode) ?? 1;
  }

goToProcessPage(itemCode: string, page: number, totalPages: number): void {
  if (page < 1 || page > totalPages) return;
  this.processPages.set(itemCode, page);
  this.cdr.detectChanges();
}

  getProcessTotalPages(item: Item): number {
    return Math.max(1, Math.ceil(this.filterProcesses(item.processes).length / this.processPageSize));
  }

  getPaginatedProcesses(item: Item): Process[] {
    const filtered = this.filterProcesses(item.processes);
    const page = this.getProcessPage(item.code);
    const start = (page - 1) * this.processPageSize;
    return filtered.slice(start, start + this.processPageSize);
  }

  getProcessPageNumbers(item: Item): number[] {
    const total = this.getProcessTotalPages(item);
    const current = this.getProcessPage(item.code);

    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages: number[] = [];
    pages.push(1);
    if (current > 4) pages.push(-1);
    const start = Math.max(2, current - 2);
    const end = Math.min(total - 1, current + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 3) pages.push(-1);
    pages.push(total);
    return pages;
  }

  resetProcessPage(item: Item): void {
  this.processPages.set(item.code, 1);
  // No API call — item.processes already has all data from loadItems()
}

  // ════════════════════════════════════════
  // TOGGLE & SELECTION
  // ════════════════════════════════════════
  getSelectedCount(): number { return this.items.filter(i => i.selected).length; }
  isAllSelected(): boolean { return this.items.length > 0 && this.items.every(i => i.selected); }
  toggleAllSelection(event: any): void { this.filteredItems.forEach(i => i.selected = event.target.checked); }
  clearSelection(): void { this.items.forEach(i => i.selected = false); }

  toggleProcess(item: any): void {
    const open = item.expanded;
    this.items.forEach(i => i.expanded = false);
    if (!open) {
      item.expanded = true;
      this.resetProcessPage(item);
    }
  }

  // Badge letter for currently selected code
  get insertBadge(): string {
    return this.insertSelectedCode ? this.insertSelectedCode.charAt(0).toUpperCase() : '';
  }

  // True if code already exists
  isItemAlreadyAdded(code: string): boolean {
    return this.items.some(i => i.code.toUpperCase() === code.toUpperCase());
  }
}