import { Button, Column, Grid, Layer, Tile } from "@carbon/react";

export function GuestLanding() {
  return (
    <Grid fullWidth className="landing-grid">
      <Column sm={4} md={8} lg={8} xlg={8} max={8}>
        <Layer>
          <main className="landing-shell">
            <Tile className="landing-card">
              <p className="cds--type-label-01">Alexclaw Research Hub</p>
              <h1 className="cds--type-productive-heading-06">Your thesis workspace, now Carbon-native.</h1>
              <p className="cds--type-body-01 understated">
                Create a project with thesis text and background research starts automatically. Use dashboard,
                explorer, reading list, and chat in one place.
              </p>
              <ul className="landing-list cds--type-body-01">
                <li>Project-scoped papers, memory docs, and chats.</li>
                <li>Integrated notes, comments, and reading workflow.</li>
                <li>Background refreshes while you keep writing.</li>
              </ul>
              <div>
                <Button kind="primary" href="/auth/google">
                  Sign in with Google
                </Button>
              </div>
            </Tile>
          </main>
        </Layer>
      </Column>
    </Grid>
  );
}
