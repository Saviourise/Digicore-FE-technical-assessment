/**
 * TransactionsComponent (fixed version)
 *
 * Numbers in the comments, e.g. (4), refer to the issues listed in
 * Part A, Question 1. Letters, e.g. (a), refer to the fixes in Question 2.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { Observable, combineLatest, of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  startWith,
} from 'rxjs/operators';
import { TransactionService } from './transaction.service';

// (5) Explicit types instead of never[] and `any`
export interface Transaction {
  id: string;
  // (2) Modelled as nullable so the compiler forces every use to handle it
  category: string | null;
  // (10) Ideally the API sends minor units (kobo/cents) as integers and we
  // convert once for display, to avoid floating-point errors with money
  amount: number;
  currency: string; // e.g. 'NGN'
}

// (11) One object describing everything the template needs to render
interface TransactionsViewState {
  items: Transaction[];
  loading: boolean;
  error: boolean;
}

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [ReactiveFormsModule, AsyncPipe, CurrencyPipe, ScrollingModule],
  // (c) OnPush: only re-check this component when the async pipe emits
  // or a user event happens, not on every change anywhere in the app
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- (d) Proper label for accessibility -->
    <label for="transaction-search">Search transactions</label>

    <!-- (5)(7) Typed reactive form control replaces (input) + event: any -->
    <input
      id="transaction-search"
      type="search"
      [formControl]="search"
      placeholder="Search by category"
      autocomplete="off"
    />

    <!--
      (b)(6) The async pipe subscribes when the component renders and
      unsubscribes automatically when it is destroyed. No manual cleanup.
    -->
    @if (vm$ | async; as vm) {
      <!-- (11) Loading, error and empty states -->
      @if (vm.loading) {
        <p>Loading transactions…</p>
      } @else if (vm.error) {
        <p role="alert">We couldn't load your transactions. Refresh the page to try again.</p>
      } @else if (vm.items.length === 0) {
        <p>No transactions match your search.</p>
      } @else {
        <!--
          (8) Virtual scrolling: only the rows visible on screen exist in the
          DOM, so 10,000 transactions cost the same as about 15.
          (c) trackBy lets Angular reuse rows instead of recreating them.
        -->
        <cdk-virtual-scroll-viewport itemSize="48" class="transaction-list">
          <div
            *cdkVirtualFor="let t of vm.items; trackBy: trackById"
            class="transaction-row"
          >
            <!-- (2) Null-safe rendering -->
            <span>{{ t.category ?? 'Uncategorised' }}</span>
            <!-- (10) Currency pipe: 1000.5 becomes ₦1,000.50 -->
            <span>{{ t.amount | currency: t.currency }}</span>
          </div>
        </cdk-virtual-scroll-viewport>
      }
    }
  `,
  styles: [
    `
      .transaction-list {
        height: 480px;
      }
      .transaction-row {
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
    `,
  ],
})
export class TransactionsComponent {
  readonly search = new FormControl('', { nonNullable: true });

  readonly vm$: Observable<TransactionsViewState>;

  // (1) The service is properly injected through the constructor
  constructor(private readonly transactionService: TransactionService) {

    // (a)(4) Single source of truth: the raw transactions from the API.
    // (3) catchError turns an API failure into an error state for the UI.
    // (11) startWith gives an initial loading state before data arrives.
    const state$: Observable<TransactionsViewState> =
      this.transactionService.getTransactions().pipe(
        map((items) => ({ items, loading: false, error: false })),
        catchError(() => of({ items: [], loading: false, error: true })),
        startWith({ items: [], loading: true, error: false }),
      );

    const searchTerm$: Observable<string> = this.search.valueChanges.pipe(
      // (7) Wait until the user pauses typing before filtering
      debounceTime(300),
      // (9) Trim spaces and normalise case so "Food " matches "food"
      map((value) => value.trim().toLowerCase()),
      // (7) Skip filtering if the term didn't actually change
      distinctUntilChanged(),
      startWith(''),
    );

    // (a)(4) The filtered list is derived, never stored separately.
    // Whenever new data arrives OR the search term changes, the list is
    // recalculated from both, so the UI and the search box always agree.
    this.vm$ = combineLatest([state$, searchTerm$]).pipe(
      map(([state, term]) => ({
        ...state,
        items: term
          ? state.items.filter((t) =>
              // (2) A null category is treated as an empty string, so it no
              // longer crashes; it simply doesn't match the search
              (t.category ?? '').toLowerCase().includes(term),
            )
          : state.items,
      })),
    );
  }

  // (c) Rows are identified by id, so unchanged rows are reused
  trackById(_index: number, transaction: Transaction): string {
    return transaction.id;
  }
}
