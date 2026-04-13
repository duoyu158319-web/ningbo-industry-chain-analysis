from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from core.database import get_db
from models.patent import Patent
from schemas.recognize import PatentCreate, PatentDetail
from schemas.base import ApiResponse, PaginationMeta

router = APIRouter()


@router.get("/", response_model=ApiResponse[List[PatentDetail]])
def get_patents(
    enterprise_id: Optional[int] = None,
    ipc_prefix: Optional[str] = Query(None, description="IPC前缀过滤，如 H01M，用前缀匹配"),
    industry_chain: Optional[str] = Query(None, description="按产业链名称过滤关联企业的专利"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """查询专利列表，支持按企业ID、IPC前缀、产业链过滤"""
    from models.enterprise import Enterprise

    query = db.query(Patent)

    if enterprise_id is not None:
        query = query.filter(Patent.enterprise_id == enterprise_id)

    # NOTE: ipc_prefix 前缀匹配 —— ipc_codes 字段可能包含多个逗号分隔的IPC号
    # LIKE 'H01M%' 覆盖 "H01M4/36,..." 的情形，或通过 OR 覆盖中间位置
    if ipc_prefix:
        query = query.filter(Patent.ipc_codes.like(f"{ipc_prefix}%") | Patent.ipc_codes.like(f"%,{ipc_prefix}%"))

    # NOTE: 按产业链过滤时，先找该产业链下所有企业ID，再过滤专利
    if industry_chain:
        ent_ids = [
            r.id for r in db.query(Enterprise.id)
            .filter(Enterprise.industry_chain == industry_chain)
            .all()
        ]
        if ent_ids:
            query = query.filter(Patent.enterprise_id.in_(ent_ids))
        else:
            query = query.filter(False)  # 无对应企业，返回空

    total = query.count()
    items = query.order_by(Patent.pub_date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return ApiResponse(
        data=items,
        pagination=PaginationMeta(page=page, page_size=page_size, total=total),
    )


@router.post("/", response_model=ApiResponse[PatentDetail])
def create_patent(body: PatentCreate, db: Session = Depends(get_db)):
    """
    新增专利（页面手动录入）。
    ipc_codes 填写逗号分隔的 IPC 号，如 "H01M4/36,H01M10/0525"；
    无 IPC 时留空，识别时将使用标题+摘要文本匹配替代。
    """
    patent = Patent(
        enterprise_id=body.enterprise_id,
        title=body.title,
        abstract=body.abstract,
        ipc_codes=body.ipc_codes,
        patent_type=body.patent_type,
        pub_date=body.pub_date,
        applicant=body.applicant,
        source="manual",
    )
    db.add(patent)
    db.commit()
    db.refresh(patent)
    return ApiResponse(data=patent)


@router.get("/{patent_id}/", response_model=ApiResponse[PatentDetail])
def get_patent(patent_id: int, db: Session = Depends(get_db)):
    """查询单条专利详情"""
    patent = db.query(Patent).filter(Patent.id == patent_id).first()
    if not patent:
        return ApiResponse(code=404, message="专利不存在")
    return ApiResponse(data=patent)


@router.delete("/{patent_id}/", response_model=ApiResponse[None])
def delete_patent(patent_id: int, db: Session = Depends(get_db)):
    """删除专利"""
    patent = db.query(Patent).filter(Patent.id == patent_id).first()
    if not patent:
        return ApiResponse(code=404, message="专利不存在")
    db.delete(patent)
    db.commit()
    return ApiResponse(message="删除成功")
