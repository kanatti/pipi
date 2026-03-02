function codeBlock(content: string): string {
  return `\`\`\`\n${content}\n\`\`\``;
}

export function getFirstWorkerConnectedMessage(workerId: string): string {
  return `Worker **${workerId}** connected and ready.

**How to Use Workers:**

You can communicate with workers using the \`send_to_worker\` tool.

**When to Use Each Tool:**

**Normal tools** (bash, read, write, edit):
- For your work in this terminal
- Files you read/write are in your directory
- Commands you run execute here

**Worker communication** (send_to_worker):
- To send messages to worker agents
- Workers are independent pi instances in other terminals
- They can work on tasks in parallel

**Example:**
${codeBlock(`send_to_worker(workerId="${workerId}", message="Please list files in the current directory")`)}

**Incoming Messages:**

Worker messages appear as: **[Worker][${workerId}]:**`;
}

export function getWorkerConnectedMessage(workerId: string): string {
  return `Worker **${workerId}** connected and ready.

**Worker communication** (send_to_worker):

You can communicate with this worker using:
${codeBlock(`send_to_worker(workerId="${workerId}", message="Your task here")`)}`;
}

export function getWorkerDisconnectedMessage(workerId: string): string {
  return `Worker **${workerId}** has disconnected.`;
}

export function formatWorkerMessage(workerId: string, content: string): string {
  return `**[Worker][${workerId}]:**\n\n${content}`;
}

export function getSocketInfoMessage(socketPath: string, managerName: string): string {
  return `**Manager Socket:**

\`${socketPath}\`

Workers can connect using:
${codeBlock(`picode --name <worker-name>
# Then inside worker:
/connect ${managerName}`)}`;
}

export function getWorkerClosedMessage(workerId: string): string {
  return `Worker **${workerId}** has been closed and is no longer available.`;
}

export function getWorkerConnectedToManagerMessage(workerId: string, managerName?: string): string {
  const title = managerName 
    ? `Connected to manager **${managerName}**!`
    : `Connected to manager as worker **${workerId}**!`;
  
  return `${title}

**How to Communicate:**

You can communicate with the manager using the \`send_to_manager\` tool.

**When to Use Each Tool:**

**Normal tools** (bash, read, write, edit):
- For your work in this terminal
- Files you read/write are in your directory
- Commands you run execute here

**Manager communication** (send_to_manager):
- To send messages to the manager
- Report progress, ask questions, or request help

**Example:**
${codeBlock(`send_to_manager(message="Task completed successfully")`)}

**Incoming Messages:**

Manager messages appear as: **[Manager]${managerName ? `[${managerName}]` : ''}:**`;
}

export function getManagerDisconnectedMessage(managerName?: string): string {
  return managerName
    ? `Disconnected from manager **${managerName}**.`
    : `Manager disconnected. I can no longer communicate with the manager.`;
}
