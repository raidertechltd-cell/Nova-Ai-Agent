// LangGraph skeleton: model the supervisor and workers as nodes in a DAG/state-machine
// Note: requires `langgraph` or similar framework — this file provides a lightweight
// structure that can be replaced with real LangGraph nodes/edges.

import { Supervisor } from './agents/supervisor'

export function buildGraph(supervisor: Supervisor) {
  // Pseudo-graph: supervisor -> {AnalystAgent,FinanceAgent,StudioAgent}
  return {
    start: async (command: string) => supervisor.handleCommand(command),
  }
}
