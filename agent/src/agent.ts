import { stringify } from 'querystring';
import { HookSpec } from './lib/types';
import { formatObjCMethod } from './lib/formatters';

export class Agent {
    private moduleBase = Process.enumerateModules()[0].base;
    private cachedObjCResolver: ApiResolver | null = null;
    private cachedModuleResovler: ApiResolver | null = null
    private objc_msgSend: NativePointer | null = null;
    private stackDepth: number = 0;
    private installedHooks = 0;

    init(spec: HookSpec, stackDepth: number) {
        this.stackDepth = stackDepth;

        try {
            this.start(spec);
            send({
                type: 'agent:installed_hooks',
                message: {
                    hooks: this.installedHooks,
                    depth: this.stackDepth
                } 
            });
        } catch (e) {
            send({
                type: 'agent:error',
                message: e.message
            });
        }
    }

    private start(spec: HookSpec): number {
        this.objc_msgSend = Module.findExportByName(null, 'objc_msgSend');
        if (this.objc_msgSend == null) {
            throw new Error("Could not find objc_msgSend");
        }

        let installedHooks: number = 0;

        for (const [key, value] of spec) {
            switch (key) {
                case 'objc_method': {
                    this.installObjCHook(<string>value);
                    break;
                }
                case 'function': {
                    this.installFunctionHook(<string>value);
                    break;
                }
                case 'function_offset': {
                    this.installFunctionOffsetHook(<number>value);
                    break;
                }
            }
        } 
        
        return installedHooks;
    }

    private installObjCHook(pattern: string) {
        for (const m of this.getObjCResolver().enumerateMatches(pattern)) {
            this.installHook(m.address, m.name);
        }
    }

    private getObjCResolver(): ApiResolver {
        let resolver = this.cachedObjCResolver;
        if (resolver == null) {
            try {
                resolver = new ApiResolver('objc');
            } catch (e) {
                throw new Error("Objective-C runtime is not available");
            }

            this.cachedObjCResolver = resolver;
        }
        return resolver;
    }
    
    private installFunctionHook(pattern: string) {
        for (const m of this.getModuleResolver().enumerateMatches(pattern)) {
            this.installHook(m.address, m.name);
        }
    }

    private getModuleResolver(): ApiResolver {
        let resolver = this.cachedModuleResovler;
        if (resolver == null) {
            resolver = new ApiResolver('module');
            this.cachedModuleResovler = resolver;
        }
        return resolver;
    }

    private installFunctionOffsetHook(offset: number) {
        const funcAbsoluteAddr: NativePointer = this.moduleBase.add(offset);
        this.installHook(funcAbsoluteAddr, `function at address ${funcAbsoluteAddr}`)
    }

    private hook = null;
    private installHook(pointer: NativePointer, funcDescription: string) {
        const objc_msgSend = <NativePointer>this.objc_msgSend;
        const agent = this;

        Interceptor.attach(pointer, {
            onEnter: function (args) {
                const originThreadId = this.threadId;
                console.log("\n" + funcDescription);
                this.hook = Interceptor.attach(objc_msgSend, 
                    {
                        onEnter: function (args) {
                            if (this.threadId == originThreadId) {
                                agent.objcOnEnter(this, args);
                            }
                        }
                    });
            }, onLeave: function (retval) {
                console.log("Exiting\n");
                this.hook.detach();
            }
        });
        this.installedHooks++;
    }

    private objcOnEnter(ctx: InvocationContext, args: InvocationArguments) {
        if (ctx.depth > this.stackDepth) {
            return;
        }

        const id = args[0];
        const selector = args[1].readCString();
        let cls;
        let typeQualifier: string;

        if (ObjC.api.object_isClass(id)) {
            typeQualifier = '+';
            cls = id;
        } else {
            typeQualifier = '-';
            cls = ObjC.api.object_getClass(id);
        }

        let clsName = ObjC.api.class_getName(cls).readCString();
        console.log('|  '.repeat(ctx.depth) + `${typeQualifier}[${clsName} ${selector}]`);
    }
}