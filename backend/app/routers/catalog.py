"""Operational catalog: vendors, hotels, activities, transportation, destinations."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import AuthUser, Role, get_current_user, require_roles, can_access_vendor
from app.database import get_db
from app.models import Vendor, Hotel, Activity, Transportation, Destination
from app.schemas import (
    VendorIn, VendorOut, HotelIn, HotelOut, ActivityIn, ActivityOut,
    TransportationIn, TransportationOut, DestinationOut,
)

router = APIRouter(prefix="/api/v1", tags=["catalog"])

_staff = require_roles(Role.OPERATOR, Role.ADMIN)


def _paginate(q, page: int, page_size: int):
    return q.offset((page - 1) * page_size).limit(page_size).all()


# ---------- Vendors ----------
@router.get("/vendors", response_model=list[VendorOut])
def list_vendors(user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db),
                 page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100)):
    if user.role == Role.VENDOR:
        vendors = db.query(Vendor).filter(Vendor.profile_id == user.id).all()
    elif user.role in (Role.OPERATOR, Role.ADMIN, Role.COORDINATOR):
        vendors = _paginate(db.query(Vendor).order_by(Vendor.name), page, page_size)
    else:
        vendors = _paginate(db.query(Vendor).filter(Vendor.is_active == True).order_by(Vendor.name), page, page_size)  # noqa: E712
    return [VendorOut.model_validate(v) for v in vendors]


@router.post("/vendors", response_model=VendorOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(_staff)])
def create_vendor(data: VendorIn, db: Session = Depends(get_db)):
    v = Vendor(**data.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return VendorOut.model_validate(v)


@router.patch("/vendors/{vendor_id}", response_model=VendorOut)
def update_vendor(vendor_id: UUID, data: VendorIn,
                  user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    v = db.get(Vendor, vendor_id)
    if not v:
        raise HTTPException(404, "Vendor not found")
    if user.role not in (Role.OPERATOR, Role.ADMIN) and not can_access_vendor(user, v):
        raise HTTPException(403, "You don't have permission to update this vendor")
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(v, field, val)
    db.commit()
    db.refresh(v)
    return VendorOut.model_validate(v)


# ---------- Hotels / Activities / Transportation (CRUD by staff; read by all authed) ----------
def _crud(prefix: str, model, in_schema, out_schema, tag: str):
    r = APIRouter(prefix=f"/api/v1/{prefix}", tags=[tag])

    @r.get("", response_model=list[out_schema])
    def _list(user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db),
              city: str | None = None, page: int = Query(1, ge=1),
              page_size: int = Query(50, ge=1, le=100)):
        q = db.query(model).filter(model.is_active == True)  # noqa: E712
        if city:
            q = q.filter(model.city.ilike(f"%{city}%"))
        return [out_schema.model_validate(x) for x in _paginate(q.order_by(model.name), page, page_size)]

    @r.post("", response_model=out_schema, status_code=status.HTTP_201_CREATED,
            dependencies=[Depends(_staff)])
    def _create(data: in_schema, db: Session = Depends(get_db)):
        obj = model(**data.model_dump())
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return out_schema.model_validate(obj)

    @r.patch("/{obj_id}", response_model=out_schema, dependencies=[Depends(_staff)])
    def _update(obj_id: UUID, data: in_schema, db: Session = Depends(get_db)):
        obj = db.get(model, obj_id)
        if not obj:
            raise HTTPException(404, "Not found")
        for field, val in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, val)
        db.commit()
        db.refresh(obj)
        return out_schema.model_validate(obj)

    @r.delete("/{obj_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(_staff)])
    def _delete(obj_id: UUID, db: Session = Depends(get_db)):
        obj = db.get(model, obj_id)
        if not obj:
            raise HTTPException(404, "Not found")
        obj.is_active = False  # soft delete
        db.commit()

    return r


hotel_router = _crud("hotels", Hotel, HotelIn, HotelOut, "hotels")
activity_router = _crud("activities", Activity, ActivityIn, ActivityOut, "activities")
transport_router = _crud("transportation", Transportation, TransportationIn, TransportationOut, "transportation")


# ---------- Destinations ----------
@router.get("/destinations", response_model=list[DestinationOut])
def list_destinations(user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db),
                      q: str | None = None, tag: str | None = None,
                      page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100)):
    query = db.query(Destination).order_by(Destination.name)
    if q:
        query = query.filter(Destination.name.ilike(f"%{q}%"))
    dests = _paginate(query, page, page_size)
    if tag:
        dests = [d for d in dests if tag.lower() in [t.lower() for t in (d.tags or [])]]
    return [DestinationOut.model_validate(d) for d in dests]
