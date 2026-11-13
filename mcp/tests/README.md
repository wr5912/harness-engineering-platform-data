# MCP 公共测试

这里保存 MCP 数据合同和当前组合清单的离线校验。测试只读取组合源文件，不连接外部服务，也不修改历史 Run。

```bash
/usr/bin/python3.10 -m unittest discover -s mcp/tests -v
```
