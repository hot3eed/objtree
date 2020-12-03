from setuptools import setup, find_packages
import os

cwd = os.path.abspath(os.path.dirname(__file__))

setup(
    name='objtree',
    version='0.5.0',
    description="tree but for Objective-C messages",
    author='hot3eed',
    author_email='hot3eed@gmail.com',
    install_requires=[
        "colorama >= 0.2.7, < 1.0.0",
        "frida >= 14.0.0, < 15.0.0",
        "prompt-toolkit >= 2.0.0, < 4.0.0",
        "pygments >= 2.0.2, < 3.0.0"
    ],
    license='Apache License 2.0',
    keywords='dynamic-instrumentation ios macos frida debugger',
    packages=find_packages(),
    package_data={
        'objtree': [os.path.join(cwd, './_agent.js')]
    },
    entry_points={
        'console_scripts': [
            'objtree=objtree.cli:main'
        ]
    }
)
