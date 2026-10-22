# ERD — Finova P0–P7 (PostgreSQL)

Đối chiếu `prisma/schema.prisma` và **9 migration directories** ngày 21/10/2026 (từ `20261019174000_init` đến `20261020121500_api_rate_limit`). Cột tiền là PostgreSQL `NUMERIC(20,4)`; dữ liệu nghiệp vụ ràng buộc theo `workspaceId`. Sơ đồ nêu các quan hệ chính (không thay thế định nghĩa Prisma đầy đủ). P6 có `RecurringRule`, `RecurringOccurrence`, `Notification`, `ImportBatch`, `ImportRow`; P7 thêm `ApiRateLimit`, xem schema là nguồn chuẩn cho toàn bộ FK/index.

```mermaid
erDiagram
  User ||--o{ Session : has
  User ||--o{ Account : OAuth
  User ||--o| UserPreferences : configures
  User ||--o{ Membership : joins
  User ||--o{ Workspace : creates
  Workspace ||--o{ Membership : grants
  Workspace ||--o{ Wallet : owns
  Workspace ||--o{ Category : owns
  Workspace ||--o{ LedgerAccount : owns
  Workspace ||--o{ Transaction : records
  Workspace ||--o{ Journal : records
  Workspace ||--o{ AuditLog : records
  Workspace ||--o{ Budget : plans
  Budget ||--o{ BudgetCategory : scopes
  Budget ||--o{ BudgetAlert : alerts
  Category ||--o{ BudgetCategory : budgeted
  Workspace ||--o{ SavingsGoal : earmarks
  Wallet ||--o{ SavingsGoal : funds
  SavingsGoal ||--o{ GoalAllocation : events
  Workspace ||--o{ GoalAllocation : records
  Workspace ||--o{ DebtContract : tracks
  Wallet ||--o{ DebtContract : originates
  LedgerAccount ||--o| DebtContract : debtAccount
  Journal ||--o| DebtContract : origination
  DebtContract ||--o{ DebtPayment : repayments
  Wallet ||--o{ DebtPayment : paysOrReceives
  Journal ||--o| DebtPayment : records
  Workspace ||--o{ CreditCard : tracks
  LedgerAccount ||--o| CreditCard : cardAccount
  CreditCard ||--o{ CardEntry : events
  Wallet o|--o{ CardEntry : paymentSource
  Category o|--o{ CardEntry : purchaseCategory
  Journal ||--o| CardEntry : records
  CardEntry o|--o{ CardEntry : refunds
  LedgerAccount ||--o| Wallet : maps
  LedgerAccount ||--o| Category : maps
  LedgerAccount ||--o{ Posting : postedTo
  Wallet ||--o{ Transaction : sourceWallet
  Wallet o|--o{ Transaction : destinationWallet
  Category o|--o{ Transaction : classifiedAs
  Transaction o|--o{ Transaction : refundedBy
  Transaction ||--o{ Journal : describes
  Journal ||--|{ Posting : contains
  Journal o|--o| Journal : reverses
  User { string id PK
    string email UK
    string name
  }
  Account { string id PK
    string userId FK
    string providerId
    string accountId
  }
  Session { string id PK
    string userId FK
    string token UK
  }
  UserPreferences { string userId PK
    string timezone
    string currency
  }
  Workspace { string id PK
    string createdById FK
    string currency
  }
  Membership { string userId PK
    string workspaceId PK
    string role
  }
  Wallet { string id PK
    string workspaceId FK
    string ledgerAccountId UK
    string name
  }
  Category { string id PK
    string workspaceId FK
    string ledgerAccountId UK
    string kind
  }
  LedgerAccount { string id PK
    string workspaceId FK
    string code
    string kind
  }
  Transaction { string id PK
    string workspaceId FK
    decimal amount
    string walletId FK
    string categoryId FK
    int version
    string idempotencyKey
  }
  Journal { string id PK
    string transactionId FK
    string workspaceId FK
    string reversedJournalId UK
  }
  Posting { string id PK
    string journalId FK
    string ledgerAccountId FK
    decimal amount
    string side
  }
  AuditLog { string id PK
    string workspaceId FK
    string actorId
    string action
  }
  Budget { string id PK
    string workspaceId FK
    string scope
    string period
    decimal limitAmount
    datetime startAt
    datetime endAt
  }
  BudgetCategory { string budgetId PK
    string categoryId PK
    string workspaceId FK
  }
  BudgetAlert { string id PK
    string budgetId FK
    string periodKey
    string threshold
  }
  SavingsGoal { string id PK
    string workspaceId FK
    string walletId FK
    decimal target
    datetime dueAt
  }
  GoalAllocation { string id PK
    string workspaceId FK
    string goalId FK
    string kind
    decimal amount
    string idempotencyKey
  }
  DebtContract { string id PK
    string workspaceId FK
    string walletId FK
    string ledgerAccountId FK
    string originationJournalId FK
    string direction
    decimal principal
    decimal annualRate
    int installmentCount
    datetime dueAt
  }
  DebtPayment { string id PK
    string workspaceId FK
    string debtId FK
    string walletId FK
    string journalId FK
    decimal principal
    decimal interest
    string idempotencyKey
  }
  CreditCard { string id PK
    string workspaceId FK
    string ledgerAccountId FK
    decimal creditLimit
    decimal openingDebt
    int statementDay
    int paymentDueDay
  }
  CardEntry { string id PK
    string workspaceId FK
    string cardId FK
    string journalId FK
    string walletId FK
    string categoryId FK
    string originalEntryId FK
    string kind
    decimal amount
    string idempotencyKey
  }
```

`Verification` thuộc Better Auth và được lưu độc lập (identifier, value, expiresAt). Migration thứ hai bổ sung composite FK `(workspaceId, walletId)`, `(workspaceId, destinationWalletId)`, `(workspaceId, categoryId)`, `(workspaceId, originalTransactionId)` để PostgreSQL trực tiếp ngăn tham chiếu xuyên workspace. Composite unique `(workspaceId, id)` được tạo trên Wallet, Category, Transaction. Các unique khác: `(LedgerAccount.workspaceId, code)`, `(Category.workspaceId, kind, name)`, `(Transaction.workspaceId, idempotencyKey)`, `(Journal.reversedJournalId)`; index ngày/loại/ví phục vụ reporting. Việc kiểm tra quyền vẫn bắt buộc ở service/API.

Migration `20261019222000_deferred_journal_integrity` đã bổ sung deferred constraint trigger cấp PostgreSQL để từ chối journal thiếu posting, không cân Debit/Credit, sai loại tiền/số tiền hoặc tham chiếu sai workspace tại COMMIT; service `validateBalanced` và script `db:reconcile` kiểm tra thêm. Các quan hệ nghiệp vụ P4/P5 có composite FK `(workspaceId, id)` theo Prisma, xem migration tương ứng. Cần tiếp tục audit ràng buộc và backup/restore trước production.

**P7 — Rate limit:** `ApiRateLimit(key, windowStart, count, expiresAt)` có khóa chính ghép `(key, windowStart)` và index trên `expiresAt`. `key` là SHA-256 của loại quota + user/workspace được xác thực; không lưu định danh thô. PostgreSQL `INSERT ... ON CONFLICT ... WHERE count < limit` đảm bảo tăng bộ đếm nguyên tử giữa các instance. Migration mới `20261020121500_api_rate_limit`, không sửa các migration trước.
