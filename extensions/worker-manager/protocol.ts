export class LineBufferedParser {
  private buffer = '';
  
  /**
   * Feed incoming data and get complete lines
   * @returns Array of complete lines (non-empty)
   */
  feed(data: Buffer | string): string[] {
    this.buffer += data.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer
    return lines.filter(line => line.trim()); // Return only non-empty lines
  }
  
  /**
   * Clear the buffer (useful for cleanup/reset)
   */
  reset(): void {
    this.buffer = '';
  }
  
  /**
   * Get current buffer content (for debugging)
   */
  getBuffer(): string {
    return this.buffer;
  }
}
