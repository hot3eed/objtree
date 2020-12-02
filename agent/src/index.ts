import { HookSpec } from './lib/types';
import { Agent } from './agent';

const agent = new Agent();

rpc.exports = {
    init: agent.init.bind(agent)
};