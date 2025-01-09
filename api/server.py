from sqlalchemy.schema import Column
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import sessionmaker, declarative_base
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import datetime
from fastapi.middleware.cors import CORSMiddleware
import json
import random

Base = declarative_base()
db_file = 'count.db'
engine = create_engine(f'sqlite:///{db_file}')

class Ticket(Base):
    __tablename__ = 'user'
    userid = Column(String, primary_key=True)
    password = Column(String)
    correct = Column(Integer)
    bad = Column(Integer)
    correctdata = Column(String)
    baddata = Column(String)

Base.metadata.create_all(engine)

class DB:
    async def password(id):
        Session = sessionmaker(bind=engine)
        session = Session()
        user = session.query(Ticket).filter_by(userid=id).first()
        session.close()
        return user.password

    async def registration(id, password):
        Session = sessionmaker(bind=engine)
        session = Session()
        user = Ticket(userid=id, correct=0, bad=0, password=password, correctdata="{}", baddata="{}")
        session.add(user)
        session.commit()
        session.close()

    async def get_correct(id):
        Session = sessionmaker(bind=engine)
        session = Session()
        user = session.query(Ticket).filter_by(userid=id).first()
        session.close()
        return user.correct

    async def add_correct(id):
        Session = sessionmaker(bind=engine)
        session = Session()
        user = session.query(Ticket).filter_by(userid=id).first()
        user.correct += 1
        nowtime = str(datetime.datetime.now().year) +"/"+ str(datetime.datetime.now().month) +"/"+ str(datetime.datetime.now().day)
        correctdata = json.loads(user.correctdata)
        baddata = json.loads(user.baddata)

        if correctdata is None:
            correctdata = {}
        if nowtime not in correctdata:
            correctdata[nowtime] = 1
        else:
            correctdata[nowtime] += 1
        if baddata is None:
            baddata = {}
        if nowtime not in baddata:
            baddata[nowtime] = 0
        
        user.correctdata = json.dumps(correctdata)
        user.baddata = json.dumps(baddata)

        session.commit()
        session.close()

    async def add_bad(id):
        Session = sessionmaker(bind=engine)
        session = Session()
        user = session.query(Ticket).filter_by(userid=id).first()
        user.bad += 1
        nowtime = str(datetime.datetime.now().year) +"/"+ str(datetime.datetime.now().month) +"/"+ str(datetime.datetime.now().day)
        correctdata = json.loads(user.correctdata)
        baddata = json.loads(user.baddata)

        if correctdata is None:
            correctdata = {}
        if nowtime not in correctdata:
            correctdata[nowtime] = 0
        if baddata is None:
            baddata = {}
        if nowtime not in baddata:
            baddata[nowtime] = 1
        else:
            baddata[nowtime] += 1

        user.correctdata = json.dumps(correctdata)
        user.baddata = json.dumps(baddata)

        session.commit()
        session.close()


    async def get_bad(id):
        Session = sessionmaker(bind=engine)
        session = Session()
        user = session.query(Ticket).filter_by(userid=id).first()
        session.close()
        return user.bad

    async def get_all(id):
        Session = sessionmaker(bind=engine)
        session = Session()
        user = session.query(Ticket).filter_by(userid=id).first()
        session.close()
        return {"correct":json.loads(user.correctdata),"bad":json.loads(user.baddata)}
    
    async def get(id):
        Session = sessionmaker(bind=engine)
        session = Session()
        user = session.query(Ticket).filter_by(userid=id).first()
        session.close()
        return {"correct": user.correct, "bad": user.bad}
    


fastapi = FastAPI()

fastapi.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
)

class Data(BaseModel):
    id: str
    password: str

@fastapi.post("/registration")
async def registration(data: Data):
    await DB.registration(data.id, data.password)
    return {"message": "registration"}

@fastapi.post("/get_correct")
async def get_correct(data: Data):
    if not await DB.password(data.id) == data.password:
        return {"message": "password is wrong"}
    return {"correct": await DB.get_correct(data.id)}

@fastapi.post("/add_correct")
async def add_correct(data: Data):
    if not await DB.password(data.id) == data.password:
        return {"message": "password is wrong"}
    await DB.add_correct(data.id)
    return {"message": "add_correct"}

@fastapi.post("/add_bad")
async def add_bad(data: Data):
    if not await DB.password(data.id) == data.password:
        return {"message": "password is wrong"}
    await DB.add_bad(data.id)
    return {"message": "add_bad"}

@fastapi.post("/get_bad")
async def get_bad(data: Data):
    if not await DB.password(data.id) == data.password:
        return {"message": "password is wrong"}
    return {"bad": await DB.get_bad(data.id)}

@fastapi.post("/get")
async def get_bad(data: Data):
    if not await DB.password(data.id) == data.password:
        return {"message": "password is wrong"}
    return await DB.get(data.id)

@fastapi.get("/get/{id}/{password}")
async def get_all(id: str, password: str):
    if not await DB.password(id) == password:
        return {"message": "password is wrong"}
    return await DB.get_all(id)

@fastapi.get("/ranking")
async def ranking():
    Session = sessionmaker(bind=engine)
    session = Session()
    users = session.query(Ticket).order_by(Ticket.correct.desc()).limit(5).all()
    session.close()
    return [{"userid": user.userid, "correct": user.correct, "bad": user.bad} for user in users if user.correct != 0]

@fastapi.post("/change/name/{newname}")
async def change_name(data: Data, newname: str):
    if not await DB.password(data.id) == data.password:
        return {"message": "password is wrong"}
    Session = sessionmaker(bind=engine)
    session = Session()
    user = session.query(Ticket).filter_by(userid=data.id).first()
    user.userid = newname
    session.commit()
    session.close()
    return {"message": "change name"}

@fastapi.post("/change/password/{newpassword}")
async def change_password(data: Data, newpassword: str):
    if not await DB.password(data.id) == data.password:
        return {"message": "password is wrong"}
    Session = sessionmaker(bind=engine)
    session = Session()
    user = session.query(Ticket).filter_by(userid=data.id).first()
    user.password = newpassword
    session.commit()
    session.close()
    return {"message": "change password"}

@fastapi.get("/quizbox/mosi/get")
async def mosiget():
    with open('../app/itpasu/play/mondai/management.json', 'r') as file:#20
        management_deta = json.load(file)
    with open('../app/itpasu/play/mondai/strategy.json', 'r') as file:#35
        strategy_deta = json.load(file)
    with open('../app/itpasu/play/mondai/technology.json', 'r') as file:#45
        technology_deta = json.load(file)

    mondai = []

    management_mondai = random.sample(management_deta, min(20, len(management_deta)))

    strategy_mondai = random.sample(strategy_deta, min(35, len(strategy_deta)))

    technology_mondai = random.sample(technology_deta, min(45, len(technology_deta)))

    combined_mondai = management_mondai + strategy_mondai + technology_mondai

    return combined_mondai


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(fastapi, host="0.0.0.0", port=8080)
