declare module "cloudflare:workers" {
  export class WorkflowEntrypoint<TEnv = unknown, TParams = unknown> {
    protected env: TEnv;
    run(
      event: { payload?: TParams; params?: TParams },
      step: { do(name: string, fn: () => Promise<unknown>): Promise<unknown> }
    ): Promise<unknown>;
  }
}
