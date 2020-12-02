from os import path

import frida

from ..console import logger


class Hooker:
    def __init__(self, profile, session, reactor):
        self._profile = profile
        self._script_path = path.join(path.abspath(path.dirname(__file__)), '../../_agent.js')
        self._script = None        
        with open(self._script_path) as src_f:
            script_src = src_f.read()
        self._script = session.create_script(script_src)
        self._agent = None
        self._reactor = reactor

    def start_hooking(self, ui):
        def on_message(message, data):
            self._reactor.schedule(lambda: self._on_message(message, data, ui))

        self._script.on('message', on_message)
        self._script.load()
        self._agent = self._script.exports
        self._agent.init(self._profile.spec, self._profile.stack_depth)

    def _on_message(self, message, data, ui):
        if message['type'] == 'send':
            payload = message['payload']
            mtype = payload['type']
            message = payload['message'] if 'message' in payload else None
            if mtype == 'agent:error':
                ui._update_status(f"Failed to install hooks: {message}")
                ui._exit(1)
            elif mtype == 'agent:installed_hooks':
                num_hooks = message['hooks']
                stack_depth = message['depth']
                ui._update_status(f"Hooks installed successfully, intercepting {num_hooks} function(s) at stack depth {stack_depth}...")
            else:
                print(message)
        else:
            print(message)