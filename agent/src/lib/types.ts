export type HookSpec = HookSpecItem[];
type HookSpecItem = [HookSpecKey, HookSpecValue];
type HookSpecKey = 'objc_method' | 'function' | 'function_offset' | 'stack_depth';
type HookSpecValue = string | number;

type ObjCMessage = string;
type Depth = number;
export type TraceEvent = [Depth, ObjCMessage];