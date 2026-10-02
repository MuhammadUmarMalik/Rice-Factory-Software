// Re-export only. This module used to carry its own copy of apiRequest, identical
// to queryClient.ts's except that it silently dropped errors instead of forwarding
// them to window.electronLog. Callers keep importing from here; there is one
// implementation.
export { apiRequest } from "./queryClient";
