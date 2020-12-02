# frida-fs

Create a stream from a filesystem resource.

## Example

```js
const fs = require('frida-fs');

fs.createReadStream('/etc/hosts').pipe(networkStream);
```
