# from objtree.console.cli import main

from objtree.utils.hooker import Hooker

def main():
    from frida_tools.application import ConsoleApplication
    from frida_tools.tracer import UI

    class TestApplication(ConsoleApplication, UI):
        def _usage(self):
            return "usage: %prog [options] target"

        def _needs_target(self):
            return True

        def _add_options(self, parser):
            pb = HookerProfileBuilder()
            def process_builder_arg(option, opt_str, value, parser, method, **kwargs):
                method(value)
            parser.add_option('-m', '--hook-objc-method', help="hook OBJC_METHOD", 
                                metavar='OBJC_METHOD', type='string', action='callback',
                                callback=process_builder_arg, callback_args=(pb.hook_objc_method,))
            parser.add_option('-u', '--hook-function', help="hook FUNCTION",
                                metavar='FUNCTION', type='string', action='callback',
                                callback=process_builder_arg, callback_args=(pb.hook_function,))
            parser.add_option('-t', '--hook-function-offset', help="hook FUNCTION_OFFSET relative to binary base",
                                metavar='FUNCTION_OFFSET', type='int', action='callback',
                                callback=process_builder_arg, callback_args=(pb.hook_function_offset,))
            parser.add_option('-s', '--stack-depth', type='int', action='callback',
                                callback=process_builder_arg, callback_args=(pb.set_stack_depth,))
            self._profile_builder = pb

        def _initialize(self, parser, options, args):
            self._profile = self._profile_builder.build()

        def _start(self):
            hooker = Hooker(self._profile, self._session, self._reactor)
            hooker.start_hooking(self)

    app = TestApplication()
    app.run()


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


class HookerProfile(object):
    def __init__(self, spec, stack_depth):
        self.spec = spec 
        self.stack_depth = stack_depth


if __name__ == '__main__':
    main()