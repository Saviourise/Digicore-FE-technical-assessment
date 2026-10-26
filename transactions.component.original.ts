@Component({
  selector: 'app-transactions',
  template: `
    <input (input)="onSearch($event)" placeholder="Search" />

    <div *ngFor="let t of filteredTransactions">
      {{ t.category }} - {{ t.amount }}
    </div>
  `
})
export class TransactionsComponent {
  transactions = [];
  filteredTransactions = [];

  ngOnInit() {
    this.transactionService.getTransactions().subscribe(data => {
      this.transactions = data;
      this.filteredTransactions = data;
    });
  }

  onSearch(event: any) {
    const value = event.target.value;

    this.filteredTransactions = this.transactions.filter(t =>
      t.category.includes(value)
    );
  }
}
