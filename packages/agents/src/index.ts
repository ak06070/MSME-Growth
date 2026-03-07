export interface AgentTool {
  id: string;
  description: string;
}

export interface AgentPolicy {
  advisoryOnly: boolean;
  allowedTools: AgentTool[];
}

export const defaultAgentPolicy: AgentPolicy = {
  advisoryOnly: true,
  allowedTools: []
};
