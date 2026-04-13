# 此目录存放离线训练产生的 pkl 模型文件
# 命名规范:
#   {chain_name}_vectorizer.pkl  — TF-IDF 向量化器
#   {chain_name}_model.pkl       — LinearSVC 分类器
#   {chain_name}_report.txt      — 训练分类报告
#
# 初始为空目录，识别服务启动时会自动检测，无模型则降级为关键词匹配。
# 训练完成后将 pkl 文件放入此目录，重启服务即可生效（无需修改代码）。
