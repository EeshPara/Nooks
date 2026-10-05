export class InputError extends Error { constructor(message, code = 'INVALID_INPUT') { super(message); this.code = code; } }
