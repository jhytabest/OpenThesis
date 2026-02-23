import {
  ActivityIcon,
  Building2Icon,
  CookieIcon,
  CreditCardIcon,
  DatabaseIcon,
  DollarSignIcon,
  FileTextIcon,
  HelpCircleIcon,
  InfoIcon,
  LifeBuoyIcon,
  LockIcon,
  ShieldCheckIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";

import { SITE_PAGE_META, buildSitePath, type SitePageKey } from "@/app/router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { SessionUser } from "@/lib/api";

interface SitePagesProps {
  page: SitePageKey;
  user: SessionUser | null;
  onNavigate: (path: string) => void;
}

const Section = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <Card>
    <CardHeader className="space-y-1 pb-2">
      <CardTitle className="text-base">{title}</CardTitle>
      {description ? <CardDescription>{description}</CardDescription> : null}
    </CardHeader>
    <CardContent className="pt-0">{children}</CardContent>
  </Card>
);

const PageGrid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-3 px-3 py-3 md:px-4 lg:px-5">{children}</div>
);

const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
  <Badge variant={ok ? "default" : "destructive"}>{label}</Badge>
);

const LegalLinks = ({ onNavigate }: { onNavigate: (path: string) => void }) => (
  <div className="flex flex-wrap gap-2">
    <Button size="sm" variant="outline" onClick={() => onNavigate(buildSitePath("privacy"))}>
      Privacy
    </Button>
    <Button size="sm" variant="outline" onClick={() => onNavigate(buildSitePath("terms"))}>
      Terms
    </Button>
    <Button size="sm" variant="outline" onClick={() => onNavigate(buildSitePath("cookies"))}>
      Cookies
    </Button>
    <Button size="sm" variant="outline" onClick={() => onNavigate(buildSitePath("subprocessors"))}>
      Subprocessors
    </Button>
    <Button size="sm" variant="outline" onClick={() => onNavigate(buildSitePath("compliance"))}>
      Compliance
    </Button>
  </div>
);

export function SitePages({ page, user, onNavigate }: SitePagesProps) {
  const meta = SITE_PAGE_META[page];
  if (meta.access === "auth" && !user) {
    return (
      <PageGrid>
        <Section
          title="Sign in required"
          description="This page is available for authenticated workspace accounts."
        >
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onNavigate("/login")}>
              Sign in
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate(buildSitePath("about"))}>
              Back to About
            </Button>
          </div>
        </Section>
      </PageGrid>
    );
  }

  if (page === "account") {
    return (
      <PageGrid>
        <Section title="Profile" description="Basic account information for your workspace login.">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Display name</Label>
              <Input id="account-name" className="h-9" value={user?.name ?? ""} readOnly />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-email">Email</Label>
              <Input id="account-email" className="h-9" value={user?.email ?? ""} readOnly />
            </div>
          </div>
        </Section>

        <Section title="Preferences" description="Workspace defaults for notifications and behavior.">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">Weekly digest: Enabled</Badge>
            <Badge variant="secondary">Product updates: Enabled</Badge>
            <Badge variant="secondary">Locale: en-US</Badge>
          </div>
        </Section>
      </PageGrid>
    );
  }

  if (page === "security") {
    return (
      <PageGrid>
        <Section title="Security Controls" description="Session and authentication health.">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge ok label="Session protected" />
            <Badge variant="outline">OAuth: Google</Badge>
            <Badge variant="outline">2FA: Recommended</Badge>
          </div>
        </Section>

        <Section title="Active Sessions" description="Recent account sessions across devices.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-10 px-3 text-xs">Device</TableHead>
                <TableHead className="h-10 px-3 text-xs">Location</TableHead>
                <TableHead className="h-10 px-3 text-xs">Last Active</TableHead>
                <TableHead className="h-10 px-3 text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">Current Browser</TableCell>
                <TableCell className="px-3 py-2 text-sm">United States</TableCell>
                <TableCell className="px-3 py-2 text-sm">Just now</TableCell>
                <TableCell className="px-3 py-2 text-sm">
                  <Badge>Active</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>
      </PageGrid>
    );
  }

  if (page === "billing") {
    return (
      <PageGrid>
        <Section title="Current Plan" description="Billing profile and subscription details.">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Pro</Badge>
            <Badge variant="outline">$29 / month</Badge>
            <Badge variant="secondary">Renews on 1st</Badge>
          </div>
        </Section>

        <Section title="Invoices" description="Downloadable billing history.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-10 px-3 text-xs">Invoice</TableHead>
                <TableHead className="h-10 px-3 text-xs">Date</TableHead>
                <TableHead className="h-10 px-3 text-xs">Amount</TableHead>
                <TableHead className="h-10 px-3 text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">INV-2026-001</TableCell>
                <TableCell className="px-3 py-2 text-sm">2026-02-01</TableCell>
                <TableCell className="px-3 py-2 text-sm">$29.00</TableCell>
                <TableCell className="px-3 py-2 text-sm">
                  <Badge>Paid</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>
      </PageGrid>
    );
  }

  if (page === "privacy") {
    return (
      <PageGrid>
        <Section title="What We Collect">
          <p className="text-sm text-muted-foreground">
            We collect account profile data, workspace content you submit, and operational logs required to
            secure and run the service.
          </p>
        </Section>
        <Section title="How We Use Data">
          <p className="text-sm text-muted-foreground">
            Data is used to provide the product, improve reliability, detect abuse, and support requests.
          </p>
        </Section>
        <Section title="Your Controls">
          <p className="text-sm text-muted-foreground">
            You can request export or deletion of your account data from the Data Controls page.
          </p>
          <div className="mt-2">
            <LegalLinks onNavigate={onNavigate} />
          </div>
        </Section>
      </PageGrid>
    );
  }

  if (page === "terms") {
    return (
      <PageGrid>
        <Section title="Service Agreement">
          <p className="text-sm text-muted-foreground">
            By using the service, you agree to use it lawfully, avoid abuse, and respect applicable licensing
            and intellectual property obligations.
          </p>
        </Section>
        <Section title="Acceptable Use">
          <p className="text-sm text-muted-foreground">
            You may not attempt unauthorized access, interfere with availability, or use the service for
            malicious activity.
          </p>
        </Section>
        <Section title="Liability and Termination">
          <p className="text-sm text-muted-foreground">
            Access can be suspended for violations. Service is provided as-is unless otherwise agreed in
            writing.
          </p>
        </Section>
      </PageGrid>
    );
  }

  if (page === "cookies") {
    return (
      <PageGrid>
        <Section title="Cookie Categories">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-10 px-3 text-xs">Category</TableHead>
                <TableHead className="h-10 px-3 text-xs">Purpose</TableHead>
                <TableHead className="h-10 px-3 text-xs">Required</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">Authentication</TableCell>
                <TableCell className="px-3 py-2 text-sm">Keep you signed in securely</TableCell>
                <TableCell className="px-3 py-2 text-sm">
                  <Badge>Yes</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">Preferences</TableCell>
                <TableCell className="px-3 py-2 text-sm">Save UI and navigation settings</TableCell>
                <TableCell className="px-3 py-2 text-sm">
                  <Badge variant="outline">Optional</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>
      </PageGrid>
    );
  }

  if (page === "support") {
    return (
      <PageGrid>
        <Section title="Support Channels" description="Fastest ways to reach the team.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-10 px-3 text-xs">Channel</TableHead>
                <TableHead className="h-10 px-3 text-xs">Use Case</TableHead>
                <TableHead className="h-10 px-3 text-xs">SLA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">support@alexclaw.app</TableCell>
                <TableCell className="px-3 py-2 text-sm">Account and billing issues</TableCell>
                <TableCell className="px-3 py-2 text-sm">1 business day</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">Security contact</TableCell>
                <TableCell className="px-3 py-2 text-sm">Vulnerability disclosure</TableCell>
                <TableCell className="px-3 py-2 text-sm">Same day triage</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>

        <Section title="Contact Form">
          <div className="grid gap-2">
            <Input className="h-9" placeholder="Subject" />
            <Textarea className="min-h-28" placeholder="Describe your issue..." />
            <Button size="sm" className="w-fit">
              Submit request
            </Button>
          </div>
        </Section>
      </PageGrid>
    );
  }

  if (page === "help") {
    return (
      <PageGrid>
        <Section title="Getting Started">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">1. Create a project</Badge>
            <Badge variant="secondary">2. Run pipeline</Badge>
            <Badge variant="secondary">3. Review papers</Badge>
            <Badge variant="secondary">4. Ask chats</Badge>
          </div>
        </Section>

        <Section title="Frequently Asked Questions">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-10 px-3 text-xs">Question</TableHead>
                <TableHead className="h-10 px-3 text-xs">Answer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">How do I refresh papers?</TableCell>
                <TableCell className="px-3 py-2 text-sm">Start a new run from the Dashboard page.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">Can I edit memory docs?</TableCell>
                <TableCell className="px-3 py-2 text-sm">Yes, from the Memory page editor panel.</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>
      </PageGrid>
    );
  }

  if (page === "status") {
    return (
      <PageGrid>
        <Section title="Current System Health" description="Live component status overview.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-10 px-3 text-xs">Component</TableHead>
                <TableHead className="h-10 px-3 text-xs">Status</TableHead>
                <TableHead className="h-10 px-3 text-xs">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">API</TableCell>
                <TableCell className="px-3 py-2 text-sm">
                  <StatusBadge ok label="Operational" />
                </TableCell>
                <TableCell className="px-3 py-2 text-sm">Just now</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">Pipeline queue</TableCell>
                <TableCell className="px-3 py-2 text-sm">
                  <StatusBadge ok label="Operational" />
                </TableCell>
                <TableCell className="px-3 py-2 text-sm">Just now</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">Search providers</TableCell>
                <TableCell className="px-3 py-2 text-sm">
                  <StatusBadge ok label="Operational" />
                </TableCell>
                <TableCell className="px-3 py-2 text-sm">Just now</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>
      </PageGrid>
    );
  }

  if (page === "data_controls") {
    return (
      <PageGrid>
        <Section title="Export Data" description="Generate a portable export of your account data.">
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Request export</Button>
            <Badge variant="outline">JSON + attachments manifest</Badge>
          </div>
        </Section>
        <Section title="Delete Account" description="Permanently delete your account and workspace data.">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="destructive">
              Request deletion
            </Button>
            <Badge variant="destructive">Irreversible</Badge>
          </div>
        </Section>
      </PageGrid>
    );
  }

  if (page === "subprocessors") {
    return (
      <PageGrid>
        <Section title="Current Subprocessors" description="Third parties used to provide core functionality.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-10 px-3 text-xs">Provider</TableHead>
                <TableHead className="h-10 px-3 text-xs">Purpose</TableHead>
                <TableHead className="h-10 px-3 text-xs">Region</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">Cloudflare</TableCell>
                <TableCell className="px-3 py-2 text-sm">Hosting, queueing, database</TableCell>
                <TableCell className="px-3 py-2 text-sm">Global</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">OpenAI</TableCell>
                <TableCell className="px-3 py-2 text-sm">Model inference</TableCell>
                <TableCell className="px-3 py-2 text-sm">US/EU</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>
      </PageGrid>
    );
  }

  if (page === "compliance") {
    return (
      <PageGrid>
        <Section title="Compliance Overview">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">DPA available</Badge>
            <Badge variant="secondary">Privacy requests supported</Badge>
            <Badge variant="secondary">Access controls enforced</Badge>
          </div>
        </Section>
        <Section title="Documentation">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-10 px-3 text-xs">Document</TableHead>
                <TableHead className="h-10 px-3 text-xs">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">Data Processing Addendum</TableCell>
                <TableCell className="px-3 py-2 text-sm">Contractual data processing terms</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="px-3 py-2 text-sm">Security Overview</TableCell>
                <TableCell className="px-3 py-2 text-sm">Controls and operations summary</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>
      </PageGrid>
    );
  }

  if (page === "changelog") {
    return (
      <PageGrid>
        <Section title="Recent Releases" description="Latest product and platform updates.">
          <div className="space-y-2">
            <Card className="border-dashed">
              <CardContent className="space-y-1 py-3">
                <p className="text-sm font-medium">2026-02-23</p>
                <p className="text-sm text-muted-foreground">
                  Introduced compact UI mode and expanded site/legal pages.
                </p>
              </CardContent>
            </Card>
            <Card className="border-dashed">
              <CardContent className="space-y-1 py-3">
                <p className="text-sm font-medium">2026-02-20</p>
                <p className="text-sm text-muted-foreground">
                  Improved paper filtering and chat reliability.
                </p>
              </CardContent>
            </Card>
          </div>
        </Section>
      </PageGrid>
    );
  }

  if (page === "about") {
    return (
      <PageGrid>
        <Section title="About Alexclaw" description="Research workflow tooling for thesis-driven discovery.">
          <p className="text-sm text-muted-foreground">
            Alexclaw helps you transform a thesis statement into an evidence-backed paper workspace with
            pipeline runs, memory docs, and iterative chat assistance.
          </p>
        </Section>
        <Section title="How It Works">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">Thesis intake</Badge>
            <Badge variant="secondary">Provider search</Badge>
            <Badge variant="secondary">Scoring + ranking</Badge>
            <Badge variant="secondary">Workspace curation</Badge>
          </div>
        </Section>
      </PageGrid>
    );
  }

  if (page === "pricing") {
    return (
      <PageGrid>
        <div className="grid gap-3 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Starter</CardTitle>
              <CardDescription>For personal exploration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <p className="text-2xl font-semibold">$0</p>
              <Badge variant="outline">3 active projects</Badge>
              <Button size="sm" variant="outline" className="w-full">
                Current option
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pro</CardTitle>
              <CardDescription>For active research workflows</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <p className="text-2xl font-semibold">$29</p>
              <Badge>Unlimited projects</Badge>
              <Button size="sm" className="w-full">
                Upgrade
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Team</CardTitle>
              <CardDescription>For collaborative orgs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <p className="text-2xl font-semibold">Custom</p>
              <Badge variant="outline">SAML + admin controls</Badge>
              <Button size="sm" variant="outline" className="w-full" onClick={() => onNavigate(buildSitePath("support"))}>
                Contact sales
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageGrid>
    );
  }

  const iconMap: Record<SitePageKey, LucideIcon> = {
    account: UserIcon,
    security: LockIcon,
    billing: CreditCardIcon,
    privacy: FileTextIcon,
    terms: FileTextIcon,
    cookies: CookieIcon,
    support: LifeBuoyIcon,
    help: HelpCircleIcon,
    status: ActivityIcon,
    data_controls: DatabaseIcon,
    subprocessors: Building2Icon,
    compliance: ShieldCheckIcon,
    changelog: FileTextIcon,
    about: InfoIcon,
    pricing: DollarSignIcon,
  };
  const Icon: LucideIcon = iconMap[page] ?? InfoIcon;

  return (
    <PageGrid>
      <Section title={meta.title} description={meta.subtitle}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" />
          <span>This page is available and ready for further policy/business copy.</span>
        </div>
      </Section>
    </PageGrid>
  );
}
