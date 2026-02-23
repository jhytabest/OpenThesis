import { Button, Column, Grid, Layer, ListItem, Stack, Tile, UnorderedList } from "@carbon/react";

export function GuestLanding() {
  return (
    <Grid fullWidth>
      <Column sm={4} md={8} lg={10} xlg={10} max={10}>
        <Layer>
          <Tile>
            <Stack gap={7}>
              <img src="/brand/alexclaw-logo-192.png" alt="Alexclaw logo" width={96} height={96} />
              <p className="cds--type-label-01">Alexclaw Research Hub</p>
              <h1 className="cds--type-productive-heading-06">Your thesis workspace, now Carbon-native.</h1>
              <p className="cds--type-body-01">
                Create a project with thesis text and background research starts automatically. Use dashboard,
                explorer, reading list, and chat in one place.
              </p>
              <UnorderedList>
                <ListItem>Project-scoped papers, memory docs, and chats.</ListItem>
                <ListItem>Integrated notes, comments, and reading workflow.</ListItem>
                <ListItem>Background refreshes while you keep writing.</ListItem>
              </UnorderedList>
              <div>
                <Button kind="primary" href="/auth/google">
                  Sign in with Google
                </Button>
              </div>
            </Stack>
          </Tile>
        </Layer>
      </Column>
    </Grid>
  );
}
