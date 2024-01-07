from .utils.hooker import Hooker

from frida_tools.application import ConsoleApplication
from frida_tools.tracer import UI, OutputFile

import argparse

class TestApplication(ConsoleApplication, UI):
    def _usage(self):
        return "usage: %prog [options] target"

    def _needs_target(self):
        return True
    
    def _add_options(self, parser: argparse.ArgumentParser):
        pb = HookerProfileBuilder()
        def process_builder_arg(option, opt_str, value, parser, method, **kwargs):
            method(value)
        parser.add_argument('-m', metavar='OBJC_METHOD', type=str, 
                            action=ProcessBuilderAction, dest='hook_objc_method',
                            help="include OBJC_METHOD", pb=pb)
        parser.add_argument('-i', metavar='FUNCTION', type=str,
                            action=ProcessBuilderAction, dest='hook_function',
                            help="include FUNCTION", pb=pb)
        parser.add_argument('-a', metavar='FUNCTION_OFFSET', type=int,
                            action=ProcessBuilderAction, dest='hook_function_offset',
                            help="add FUNCTION_OFFSET, relative to binary base (as an int, not hex)", pb=pb)
        parser.add_argument('-L', metavar='STACK_DEPTH', type=int, default=8,
                            action=ProcessBuilderAction, dest='set_stack_depth',
                            help="trace functions up to STACK_DEPTH, default is 8", pb=pb)
        parser.add_argument('-o', '--output', metavar='OUTPUT', type=str,
                            help="dump output to file OUTPUT")
        self._profile_builder = pb

    def _initialize(self, parser, options, args):
        self._profile = self._profile_builder.build()
        self._output = None
        self._output_path = options.output

    def _start(self):
        hooker = Hooker(self._profile, self._session, self._reactor)
        hooker.start_hooking(self)
        if self._output_path is not None:
            self._output = OutputFile(self._output_path)

    def _stop(self):
        if self._output is not None:
            self._output.close()
        self._output = None

    def on_finished_hooking(self, num_hooks, stack_depth):
        self._update_status(f"Intercepting {num_hooks} function(s) with stack depth {stack_depth}...")

    def on_hook_installed(self, target):
        self._print(f"[!] Installed hook at {target}")

    def on_events_add(self, events):
        for e in events:
            depth = e[0]
            objc_msg = e[1]
            out = "|  " * depth + objc_msg
            self._print(out)
            if self._output is not None:
                self._output.append(out + '\n')


class HookerProfileBuilder(object):
    def __init__(self):
        self._spec = []
        self._stack_depth = 8  # default

    def hook_objc_method(self, *objc_method_names):
        for f in objc_method_names:
            self._spec.append(('objc_method', f))
        return self

    def hook_function(self, *function_names):
        for f in function_names:
            self._spec.append(('function', f))
        return self

    def hook_function_offset(self, *function_offsets):
        for f in function_offsets:
            self._spec.append(('function_offset', int(f)))
        return self

    def set_stack_depth(self, stack_depth):
        self._stack_depth = stack_depth
        return self

    def build(self):
        return HookerProfile(self._spec, self._stack_depth)

class ProcessBuilderAction(argparse.Action):
    def __init__(self, option_strings, dest, pb: HookerProfileBuilder, nargs=None, **kwargs):
        if nargs is not None:
            raise ValueError("nargs not allowed")
        self.pb = pb
        super(ProcessBuilderAction, self).__init__(option_strings, dest, **kwargs)

    def __call__(self, parser, namespace, values, option_string=None):
        # Exemple de callback - à adapter selon votre besoin
        if self.dest == 'hook_objc_method':
            self.pb.hook_objc_method(values)
        elif self.dest == 'hook_function':
            self.pb.hook_function(values)
        elif self.dest == 'hook_function_offset':
            self.pb.hook_function_offset(values)
        elif self.dest == 'set_stack_depth':
            self.pb.set_stack_depth(values)
        setattr(namespace, self.dest, values)

class HookerProfile(object):
    def __init__(self, spec, stack_depth):
        self.spec = spec 
        self.stack_depth = stack_depth


def main():
    app = TestApplication()
    app.run()


if __name__ == '__main__':
    main()
