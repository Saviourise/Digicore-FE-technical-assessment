/**
 * Part B: Multi-Bank Custom UI Engine
 * Each section is headed with the file path it would live at.
 */

// ===== src/app/core/tenant/tenant-config.service.ts =====

export interface TenantConfig {
  tenantId: string;
  theme: Record<string, string>;
  layouts: Record<string, { component: string; props?: Record<string, unknown>; feature?: string }[]>;
  onboarding: { start: string; steps: Record<string, FlowStep> };
  validation: Record<string, { type: string; value?: unknown }[]>;
  features: Record<string, boolean>;
}

@Injectable({ providedIn: 'root' })
export class TenantConfigService {
  config!: TenantConfig;

  constructor(private readonly http: HttpClient) {}

  // Runs once at startup, before anything renders. bank-a.platform.com -> 'bank-a'
  async load(): Promise<void> {
    const tenantId = window.location.hostname.split('.')[0];
    this.config = await firstValueFrom(
      this.http.get<TenantConfig>(`/api/tenants/${tenantId}/config`),
    );
    // Apply the bank's theme as CSS variables used by all components
    Object.entries(this.config.theme).forEach(([key, value]) =>
      document.documentElement.style.setProperty(`--${key}`, value),
    );
  }
}

// ===== src/app/core/features/feature-flag.service.ts =====

@Injectable({ providedIn: 'root' })
export class FeatureFlagService {
  constructor(private readonly tenant: TenantConfigService) {}

  isEnabled(feature: string): boolean {
    return this.tenant.config.features[feature] === true;
  }
}

// Route guard: with lazy loading, a disabled feature's code is never downloaded
export const featureGuard = (feature: string): CanMatchFn => () =>
  inject(FeatureFlagService).isEnabled(feature);

// ===== src/app/core/registry/component-registry.ts =====

// Maps names used in configs to lazy-loaded components
export const COMPONENT_REGISTRY: Record<string, () => Promise<Type<unknown>>> = {
  'account-summary': () => import('../blocks/account-summary.component').then((m) => m.AccountSummaryComponent),
  'quick-transfer': () => import('../blocks/quick-transfer.component').then((m) => m.QuickTransferComponent),
  'bvn-step': () => import('../onboarding/bvn-step.component').then((m) => m.BvnStepComponent),
  'selfie-step': () => import('../onboarding/selfie-step.component').then((m) => m.SelfieStepComponent),
};

// ===== src/app/core/layout/dynamic-page.component.ts =====

@Component({
  selector: 'app-dynamic-page',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @for (block of blocks(); track $index) {
      <ng-container *ngComponentOutlet="block.component; inputs: block.inputs" />
    }
  `,
})
export class DynamicPageComponent implements OnInit {
  @Input({ required: true }) page!: string; // from route data

  readonly blocks = signal<{ component: Type<unknown>; inputs: Record<string, unknown> }[]>([]);

  constructor(
    private readonly tenant: TenantConfigService,
    private readonly flags: FeatureFlagService,
  ) {}

  async ngOnInit(): Promise<void> {
    const layout = (this.tenant.config.layouts[this.page] ?? []).filter(
      (b) => !b.feature || this.flags.isEnabled(b.feature),
    );
    this.blocks.set(
      await Promise.all(
        layout.map(async (b) => ({
          component: await COMPONENT_REGISTRY[b.component](),
          inputs: b.props ?? {},
        })),
      ),
    );
  }
}

// ===== src/app/core/onboarding/flow-engine.service.ts =====

export interface FlowStep {
  component: string;
  next?: string | { when?: string; goto: string }[];
}

@Injectable({ providedIn: 'root' })
export class FlowEngine {
  private context: Record<string, unknown> = {};

  constructor(private readonly tenant: TenantConfigService) {}

  // Returns the next step id based on the data collected, or null when done
  next(stepId: string, data: Record<string, unknown>): string | null {
    this.context = { ...this.context, ...data };
    const next = this.tenant.config.onboarding.steps[stepId]?.next;
    if (!next) return null;
    if (typeof next === 'string') return next;
    return next.find((t) => !t.when || this.context[t.when])?.goto ?? null;
  }
}

// ===== src/app/core/validation/validator-registry.ts =====

// Frontend validation is for UX only; the backend enforces the same rules
const VALIDATORS: Record<string, (value?: unknown) => ValidatorFn> = {
  required: () => Validators.required,
  min: (v) => Validators.min(Number(v)),
  pattern: (v) => Validators.pattern(String(v)),
  bvn: () => Validators.pattern(/^\d{11}$/),
};

export function validatorsFor(field: string, config: TenantConfig): ValidatorFn[] {
  return (config.validation[field] ?? [])
    .filter((rule) => rule.type in VALIDATORS)
    .map((rule) => VALIDATORS[rule.type](rule.value));
}

// ===== src/app/app.config.ts =====

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideRouter(
      [
        { path: 'dashboard', component: DynamicPageComponent, data: { page: 'dashboard' } },
        {
          path: 'loans',
          canMatch: [featureGuard('loans')],
          loadComponent: () => import('./features/loans/loans.page').then((m) => m.LoansPage),
        },
      ],
      withComponentInputBinding(),
    ),
    provideAppInitializer(() => inject(TenantConfigService).load()),
  ],
};

// ===== Example: GET /api/tenants/bank-a/config =====
/*
{
  "tenantId": "bank-a",
  "theme": { "color-primary": "#0a3d62", "font-family": "Inter, sans-serif" },
  "layouts": {
    "dashboard": [
      { "component": "account-summary" },
      { "component": "quick-transfer", "feature": "transfers" }
    ]
  },
  "onboarding": {
    "start": "bvn",
    "steps": {
      "bvn": { "component": "bvn-step", "next": [{ "when": "bvnVerified", "goto": "selfie" }] },
      "selfie": { "component": "selfie-step" }
    }
  },
  "validation": { "bvn": [{ "type": "required" }, { "type": "bvn" }] },
  "features": { "transfers": true, "loans": false }
}
*/
