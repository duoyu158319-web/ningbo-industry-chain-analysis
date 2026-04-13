from pydantic_settings import BaseSettings
from pydantic import ConfigDict

class Settings(BaseSettings):
    model_config = ConfigDict(extra='ignore', env_file='.env')
    
    PROJECT_NAME: str = "宁波市产业链智能分析平台 API"
    VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # 数据库配置
    DATABASE_URL: str = "mysql+pymysql://root:123456@127.0.0.1:3306/ningbo_chain_db"
    
    # CORS 跨域配置
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    
    # 公共可选配置（.env里有就读，没有就用默认值）
    SECRET_KEY: str = "dev_secret_key"
    
    # 高德地图 Web 服务 Key（用于地理编码 / 等时圈分析）
    AMAP_WEB_SERVICE_KEY: str = ""

settings = Settings()
