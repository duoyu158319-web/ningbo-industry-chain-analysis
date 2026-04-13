from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings

# 创建数据库引擎
# 参数 pool_pre_ping=True 会在发生请求前检查数据库连接存活性，防止错误断开
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=settings.DEBUG 
)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 声明式基类
Base = declarative_base()

# FastAPI 依赖注入服务：获取数据库的 Session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
