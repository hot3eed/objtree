import sys
from platform import platform

import click
from frida import get_local_device, get_usb_device, InvalidArgumentError

from . import logger
from ..utils.agent import Agent


@click.command()
@click.argument('target', required=False)
@click.option('-U', '--usb', 'use_usb', is_flag=True)
@click.option('-p', '--attach-pid', 'pid', type=int, help="""
    Attach using the process' PID
""")
def main(target, use_usb, pid):
    if target:
        pass
    elif pid:
        target = int(pid)
    else:
        ctx = click.get_current_context()
        click.secho(ctx.get_help())
        ctx.exit()
        sys.exit

    device = None
    if use_usb:
        try:
            device = get_usb_device()
        except InvalidArgumentError:
            logger.exit_with_error(f"USB device not found")
    else:
        pf = platform()
        if pf.startswith('macOS'):
            device = get_local_device()
        else:
            logger.exit_with_error(f"Unsupported platform {pf}")

    Agent(target, device)
    sys.stdin.read()  # Keep stdin open
