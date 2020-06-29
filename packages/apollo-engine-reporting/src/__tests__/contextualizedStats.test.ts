import { Trace, TypeStat } from 'apollo-engine-reporting-protobuf';
import { dateToProtoTimestamp } from '../treeBuilder';
import { ContextualizedStats } from '../contextualizedStats';
import { DurationHistogram } from '../durationHistogram';

const statsContext = {
  clientReferenceId: 'reference',
  clientVersion: 'version',
};

const baseDate = new Date();
const duration = 30 * 1000;
const baseTrace = new Trace({
  startTime: dateToProtoTimestamp(baseDate),
  endTime: dateToProtoTimestamp(new Date(baseDate.getTime() + duration)),
  durationNs: duration,
  root: null,
  signature: 'signature',
  details: null,
});
// TODO: add a federated trace
describe('Check query latency stats when', () => {
  it('adding a single trace', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(baseTrace);
    expect(contextualizedStats.queryLatencyStats.requestCount).toBe(1);
    expect(contextualizedStats.queryLatencyStats.latencyCount).toStrictEqual(
      new DurationHistogram().incrementDuration(duration),
    );
    expect(contextualizedStats.queryLatencyStats.requestsWithErrorsCount).toBe(
      0,
    );
  });
  it('adding a fully cached trace', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(
      new Trace({
        ...baseTrace,
        fullQueryCacheHit: true,
      }),
    );
    expect(contextualizedStats.queryLatencyStats.requestCount).toBe(1);
    expect(contextualizedStats.queryLatencyStats.cacheHits).toBe(1);
    expect(
      contextualizedStats.queryLatencyStats.cacheLatencyCount,
    ).toStrictEqual(new DurationHistogram().incrementDuration(duration));
  });
  it('adding a public cached trace', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(
      new Trace({
        ...baseTrace,
        fullQueryCacheHit: false,
        cachePolicy: {
          scope: Trace.CachePolicy.Scope.PRIVATE,
          maxAgeNs: 1000,
        },
      }),
    );
    expect(contextualizedStats.queryLatencyStats.requestCount).toBe(1);
    expect(
      contextualizedStats.queryLatencyStats.privateCacheTtlCount,
    ).toStrictEqual(new DurationHistogram().incrementDuration(1000));
  });
  it('adding a private cached trace', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(
      new Trace({
        ...baseTrace,
        fullQueryCacheHit: false,
        cachePolicy: {
          scope: Trace.CachePolicy.Scope.PUBLIC,
          maxAgeNs: 1000,
        },
      }),
    );
    expect(contextualizedStats.queryLatencyStats.requestCount).toBe(1);
    expect(
      contextualizedStats.queryLatencyStats.publicCacheTtlCount,
    ).toStrictEqual(new DurationHistogram().incrementDuration(1000));
  });
  it('adding a persisted hit trace', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(
      new Trace({
        ...baseTrace,
        persistedQueryHit: true,
      }),
    );
    expect(contextualizedStats.queryLatencyStats.requestCount).toBe(1);
    expect(contextualizedStats.queryLatencyStats.persistedQueryHits).toBe(1);
  });
  it('adding a persisted miss trace', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(
      new Trace({
        ...baseTrace,
        persistedQueryRegister: true,
      }),
    );
    expect(contextualizedStats.queryLatencyStats.requestCount).toBe(1);
    expect(contextualizedStats.queryLatencyStats.persistedQueryMisses).toBe(1);
  });
  it('adding a forbidden trace', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(
      new Trace({
        ...baseTrace,
        forbiddenOperation: true,
      }),
    );
    expect(contextualizedStats.queryLatencyStats.requestCount).toBe(1);
    expect(contextualizedStats.queryLatencyStats.forbiddenOperationCount).toBe(
      1,
    );
  });
  it('adding a registered trace', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(
      new Trace({
        ...baseTrace,
        registeredOperation: true,
      }),
    );
    expect(contextualizedStats.queryLatencyStats.requestCount).toBe(1);
    expect(contextualizedStats.queryLatencyStats.registeredOperationCount).toBe(
      1,
    );
  });
  it('adding an errored trace ', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(
      new Trace({
        ...baseTrace,
        registeredOperation: true,
        root: {
          child: [
            {
              responseName: 'user',
              parentType: 'Query',
              type: 'User!',
              error: [
                {
                  message: 'error 1',
                },
              ],
            },
          ],
        },
      }),
    );
    expect(contextualizedStats.queryLatencyStats.requestCount).toBe(1);
    expect(
      contextualizedStats.queryLatencyStats.rootErrorStats.children['user']
        .requestsWithErrorsCount,
    ).toBe(1);
    expect(
      contextualizedStats.queryLatencyStats.rootErrorStats.children['user']
        .errorsCount,
    ).toBe(1);
  });
  it('merging errored traces', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(
      new Trace({
        ...baseTrace,
        registeredOperation: true,
        root: {
          child: [
            {
              responseName: 'user',
              parentType: 'Query',
              type: 'User!',
              error: [
                {
                  message: 'error 1',
                },
              ],
            },
          ],
        },
      }),
    );
    contextualizedStats.addTrace(
      new Trace({
        ...baseTrace,
        registeredOperation: true,
        root: {
          child: [
            {
              responseName: 'account',
              parentType: 'Query',
              type: 'Account!',
              child: [
                {
                  responseName: 'name',
                  parentType: 'Account',
                  type: 'String!',
                  error: [
                    {
                      message: 'has error',
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    );
    for (let _ in [1, 2]) {
      contextualizedStats.addTrace(
        new Trace({
          ...baseTrace,
          registeredOperation: true,
          root: {
            child: [
              {
                responseName: 'user',
                parentType: 'Query',
                type: 'User!',
                child: [
                  {
                    responseName: 'email',
                    parentType: 'User',
                    type: 'String!',
                    error: [
                      {
                        message: 'has error',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
      );
    }

    expect(contextualizedStats.queryLatencyStats.requestCount).toBe(4);
    expect(
      contextualizedStats.queryLatencyStats.rootErrorStats.children['user']
        .requestsWithErrorsCount,
    ).toBe(1);
    expect(
      contextualizedStats.queryLatencyStats.rootErrorStats.children['user']
        .errorsCount,
    ).toBe(1);
    expect(
      contextualizedStats.queryLatencyStats.rootErrorStats.children['user']
        .children['email'].requestsWithErrorsCount,
    ).toBe(2);
    expect(
      contextualizedStats.queryLatencyStats.rootErrorStats.children['user']
        .children['email'].errorsCount,
    ).toBe(2);
    expect(
      contextualizedStats.queryLatencyStats.rootErrorStats.children['account']
        .requestsWithErrorsCount,
    ).toBeFalsy();
    expect(
      contextualizedStats.queryLatencyStats.rootErrorStats.children['account']
        .errorsCount,
    ).toBeFalsy();
    expect(
      contextualizedStats.queryLatencyStats.rootErrorStats.children['account']
        .children['name'].requestsWithErrorsCount,
    ).toBe(1);
    expect(
      contextualizedStats.queryLatencyStats.rootErrorStats.children['account']
        .children['name'].errorsCount,
    ).toBe(1);
  });
  it('merging non-errored traces', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(baseTrace);
    contextualizedStats.addTrace(baseTrace);
    contextualizedStats.addTrace(
      new Trace({
        ...baseTrace,
        fullQueryCacheHit: false,
        cachePolicy: {
          scope: Trace.CachePolicy.Scope.PRIVATE,
          maxAgeNs: 1000,
        },
      }),
    );
    contextualizedStats.addTrace(
      new Trace({
        ...baseTrace,
        fullQueryCacheHit: false,
        cachePolicy: {
          scope: Trace.CachePolicy.Scope.PRIVATE,
          maxAgeNs: 1000,
        },
      }),
    );
    for (let _ in [1, 2]) {
      contextualizedStats.addTrace(
        new Trace({
          ...baseTrace,
          fullQueryCacheHit: true,
        }),
      );
    }
    expect(contextualizedStats.queryLatencyStats.requestCount).toBe(6);
    expect(contextualizedStats.queryLatencyStats.latencyCount).toStrictEqual(
      new DurationHistogram()
        .incrementDuration(duration)
        .incrementDuration(duration)
        .incrementDuration(duration)
        .incrementDuration(duration),
    );
    expect(contextualizedStats.queryLatencyStats.requestsWithErrorsCount).toBe(
      0,
    );
    expect(
      contextualizedStats.queryLatencyStats.privateCacheTtlCount,
    ).toStrictEqual(
      new DurationHistogram().incrementDuration(1000).incrementDuration(1000),
    );
    expect(contextualizedStats.queryLatencyStats.cacheHits).toBe(2);
    expect(
      contextualizedStats.queryLatencyStats.cacheLatencyCount,
    ).toStrictEqual(
      new DurationHistogram()
        .incrementDuration(duration)
        .incrementDuration(duration),
    );
  });
});

describe('Check type stats', () => {
  const trace = new Trace({
    ...baseTrace,
    registeredOperation: true,
    root: {
      child: [
        {
          originalFieldName: 'user',
          responseName: 'user',
          parentType: 'Query',
          type: 'User!',
          startTime: 0,
          endTime: 100 * 1000,
          child: [
            {
              originalFieldName: 'email',
              responseName: 'email',
              parentType: 'User',
              type: 'String!',
              startTime: 1000,
              endTime: 1005,
            },
            {
              originalFieldName: 'friends',
              responseName: 'friends',
              parentType: 'User',
              type: '[String!]!',
              startTime: 1000,
              endTime: 1005,
            },
          ],
        },
      ],
    },
  });

  const federatedTrace = new Trace({
    ...baseTrace,
    registeredOperation: true,
    queryPlan: new Trace.QueryPlanNode({
      fetch: new Trace.QueryPlanNode.FetchNode({
        serviceName: 'A',
        trace: trace,
        sentTime: dateToProtoTimestamp(baseDate),
        receivedTime: dateToProtoTimestamp(
          new Date(baseDate.getTime() + duration),
        ),
      }),
    }),
  });

  const errorTrace = new Trace({
    ...baseTrace,
    registeredOperation: true,
    root: {
      child: [
        {
          originalFieldName: 'user',
          responseName: 'user',
          parentType: 'Query',
          type: 'User!',
          startTime: 0,
          endTime: 100 * 1000,
          child: [
            {
              originalFieldName: 'email',
              responseName: 'email',
              parentType: 'User',
              type: 'String!',
              startTime: 1000,
              endTime: 1005,
              error: [{ message: 'error message' }, { message: 'error2' }],
            },
            {
              originalFieldName: 'friends',
              responseName: 'friends',
              parentType: 'User',
              type: '[String!]!',
              startTime: 1000,
              endTime: 1005,
            },
          ],
        },
      ],
    },
  });

  it('add single non-federated trace', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(trace);
    expect(contextualizedStats.perTypeStat).toEqual({
      User: new TypeStat({
        perFieldStat: {
          email: {
            returnType: 'String!',
            errorsCount: 0,
            count: 1,
            requestsWithErrorsCount: 0,
            latencyCount: new DurationHistogram().incrementDuration(5),
          },
          friends: {
            returnType: '[String!]!',
            errorsCount: 0,
            count: 1,
            requestsWithErrorsCount: 0,
            latencyCount: new DurationHistogram().incrementDuration(5),
          },
        },
      }),
      Query: new TypeStat({
        perFieldStat: {
          user: {
            returnType: 'User!',
            errorsCount: 0,
            count: 1,
            requestsWithErrorsCount: 0,
            latencyCount: new DurationHistogram().incrementDuration(100 * 1000),
          },
        },
      }),
    });
  });
  it('add multiple non-federated trace', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(trace);
    contextualizedStats.addTrace(trace);
    expect(contextualizedStats.perTypeStat).toEqual({
      User: new TypeStat({
        perFieldStat: {
          email: {
            returnType: 'String!',
            errorsCount: 0,
            count: 2,
            requestsWithErrorsCount: 0,
            latencyCount: new DurationHistogram()
              .incrementDuration(5)
              .incrementDuration(5),
          },
          friends: {
            returnType: '[String!]!',
            errorsCount: 0,
            count: 2,
            requestsWithErrorsCount: 0,
            latencyCount: new DurationHistogram()
              .incrementDuration(5)
              .incrementDuration(5),
          },
        },
      }),
      Query: new TypeStat({
        perFieldStat: {
          user: {
            returnType: 'User!',
            errorsCount: 0,
            count: 2,
            requestsWithErrorsCount: 0,
            latencyCount: new DurationHistogram()
              .incrementDuration(100 * 1000)
              .incrementDuration(100 * 1000),
          },
        },
      }),
    });
  });

  it('add multiple federated trace', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(federatedTrace);
    contextualizedStats.addTrace(federatedTrace);
    expect(contextualizedStats.perTypeStat).toEqual({
      User: new TypeStat({
        perFieldStat: {
          email: {
            returnType: 'String!',
            errorsCount: 0,
            count: 2,
            requestsWithErrorsCount: 0,
            latencyCount: new DurationHistogram()
              .incrementDuration(5)
              .incrementDuration(5),
          },
          friends: {
            returnType: '[String!]!',
            errorsCount: 0,
            count: 2,
            requestsWithErrorsCount: 0,
            latencyCount: new DurationHistogram()
              .incrementDuration(5)
              .incrementDuration(5),
          },
        },
      }),
      Query: new TypeStat({
        perFieldStat: {
          user: {
            returnType: 'User!',
            errorsCount: 0,
            count: 2,
            requestsWithErrorsCount: 0,
            latencyCount: new DurationHistogram()
              .incrementDuration(100 * 1000)
              .incrementDuration(100 * 1000),
          },
        },
      }),
    });
  });
  it('add multiple federated trace', () => {
    const contextualizedStats = new ContextualizedStats(statsContext);
    contextualizedStats.addTrace(errorTrace);
    expect(contextualizedStats.perTypeStat).toEqual({
      User: new TypeStat({
        perFieldStat: {
          email: {
            returnType: 'String!',
            errorsCount: 2,
            count: 1,
            requestsWithErrorsCount: 1,
            latencyCount: new DurationHistogram().incrementDuration(5),
          },
          friends: {
            returnType: '[String!]!',
            errorsCount: 0,
            count: 1,
            requestsWithErrorsCount: 0,
            latencyCount: new DurationHistogram().incrementDuration(5),
          },
        },
      }),
      Query: new TypeStat({
        perFieldStat: {
          user: {
            returnType: 'User!',
            errorsCount: 0,
            count: 1,
            requestsWithErrorsCount: 0,
            latencyCount: new DurationHistogram().incrementDuration(100 * 1000),
          },
        },
      }),
    });
  });
});
