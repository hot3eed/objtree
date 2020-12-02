import sys

import click


def exit_with_error(m):
    """Log fatal error message and exit"""

    click.secho(f"ERROR: {m}", fg='red')
    sys.exit()


def log_success(m):
    """Log sucess with a green foreground"""
    click.secho(f"[!] {m}", fg='green')


def log_progress(m):
    """Log progress with a white foregound"""
    click.secho(f"[*] {m}", fg='white')
