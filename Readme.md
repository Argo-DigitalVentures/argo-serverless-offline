# Argo Serverless Offline

```
Usage: argo-sls [options]

Options:
  --version     Show version number                                    [boolean]
  --host        host to listen on, alternatively use HOST environment variable
                                                                        [string]
  --port        port to listen on, alternatively use PORT environment variable
                                                                        [string]
  -w, --watch   watch directory or files                                [string]
  -e, --ext     extensions to look for, ie. js,jade,hbs                 [string]
  -i, --ignore  ignore specific files or directories                    [string]
  -h, --help    Show help                                              [boolean]

Examples:
  argo-sls                             start lambda web server
  argo-sls -w -e ts                    start lambda web server and watch for
                                       changes in TypeScript files
  argo-sls --port 8080 --host 0.0.0.0  start lambda web server on all interfaces
                                       and port 8080
```
