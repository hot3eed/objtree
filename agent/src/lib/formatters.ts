export function formatObjCMethod(type: string, selector: string, isObject: boolean) {
    if (isObject) {
        return `-[${type} ${selector}]`;
    } else {
        return `+[${type} ${selector}]`;
    }
}