from typing import Any, Generic, TypeVar, Optional, List
from pydantic import BaseModel

T = TypeVar("T")

class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total: int

class ApiResponse(BaseModel, Generic[T]):
    """
    统一的 API JSON 响应体结构
    """
    code: int = 200
    message: str = "success"
    data: Optional[T] = None
    pagination: Optional[PaginationMeta] = None
