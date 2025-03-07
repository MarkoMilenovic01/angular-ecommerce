import { Component, OnInit } from '@angular/core';
import { Form, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Route, Router } from '@angular/router';
import { tap, catchError, throwError } from 'rxjs';
import { Country } from 'src/app/common/country';
import { Order } from 'src/app/common/order';
import { OrderItem } from 'src/app/common/order-item';
import { PaymentInfo } from 'src/app/common/payment-info';
import { Purchase } from 'src/app/common/purchase';
import { State } from 'src/app/common/state';
import { CartService } from 'src/app/services/cart.service';
import { CheckoutService } from 'src/app/services/checkout.service';
import { Luv2ShopFormService } from 'src/app/services/luv2-shop-form.service';
import { Luv2ShopValidators } from 'src/app/validators/luv2-shop-validators';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.css']
})
export class CheckoutComponent implements OnInit {


  checkoutFormGroup! : FormGroup;
  totalPrice : number = 0;
  totalQuantity: number = 0;
  creditCardYears: number[] = [];
  creditCardMonths: number[] = [];

  countries : Country[] = [];
  shippingStates : State[] = [];
  billingStates : State[] = [];

  storage : Storage = sessionStorage;

  // initialize Stripe API
  stripe = Stripe(environment.stripePublishableKey);

  paymentInfo : PaymentInfo = new PaymentInfo();
  cardElement : any;
  displayError: any = "";

  isDisabled: boolean = false;


  constructor(private formBuilder: FormBuilder, private luv2ShopService : Luv2ShopFormService, private cartService : CartService, private checkoutService : CheckoutService, private router: Router) { }

  ngOnInit(): void {


      this.setupStripePaymentForm();

      this.reviewCartDetails();


      // const startMonth : number = new Date().getMonth() + 1;
    
      
      // this.luv2ShopService.getCreditCardMonths(startMonth).subscribe(
      //   data => {
      //     this.creditCardMonths = data;
      //   }
      // );

      // this.luv2ShopService.getCreditCardYears().subscribe(
      //   data => {
      //     this.creditCardYears = data;
      //   }
      // )


      this.luv2ShopService.getCountries().subscribe(
        data => {
          this.countries = data
        }
      );


    this.checkoutFormGroup = this.formBuilder.group({
      customer: this.formBuilder.group({
        firstName : new FormControl('', [Validators.required, Validators.minLength(2),Luv2ShopValidators.notOnlyWhitespace]),
        lastName: new FormControl('', [Validators.required, Validators.minLength(2), Luv2ShopValidators.notOnlyWhitespace]),
        email : new FormControl(sessionStorage.getItem('userEmail'), [Validators.required, Validators.pattern('^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,4}$')])
      }),
      shippingAddress : this.formBuilder.group({
        street: new FormControl('', [Validators.required, Validators.minLength(2), Luv2ShopValidators.notOnlyWhitespace]),
        city:  new FormControl('', [Validators.required, Validators.minLength(2), Luv2ShopValidators.notOnlyWhitespace]),
        state : new FormControl('', [Validators.required]),
        country : new FormControl('', [Validators.required]),
        zipCode : new FormControl('', [Validators.required, Validators.minLength(2), Luv2ShopValidators.notOnlyWhitespace])
      }),
      billingAddress : this.formBuilder.group({
        street: new FormControl('', [Validators.required, Validators.minLength(2), Luv2ShopValidators.notOnlyWhitespace]),
        city:  new FormControl('', [Validators.required, Validators.minLength(2), Luv2ShopValidators.notOnlyWhitespace]),
        state : new FormControl('', [Validators.required]),
        country : new FormControl('', [Validators.required]),
        zipCode : new FormControl('', [Validators.required, Validators.minLength(2), Luv2ShopValidators.notOnlyWhitespace])
      }),
      creditCard : this.formBuilder.group({
        // cardType: new FormControl('', [Validators.required]),
        // nameOnCard: new FormControl('', [Validators.required, Validators.minLength(2), Luv2ShopValidators.notOnlyWhitespace]),
        // cardNumber : new FormControl('', [Validators.required, Validators.pattern('[0-9]{16}')]),
        // securityCode : new FormControl('', [Validators.required, Validators.pattern('[0-9]{3}')]),
        // expirationMonth : [''],
        // expirationYear : [''],
      }),
    });
  }



  setupStripePaymentForm() {
    // get a handle to stripe elements
    var elements = this.stripe.elements();
    // create a card element
    this.cardElement = elements.create('card', {hidePostalCode : true});
    // add an instance of card UI component into the 'card-element' div
    this.cardElement.mount('#card-element');
    //Add event biding for the 'change' event on the card element
    this.cardElement.on('change', (event : any) => {
      this.displayError = document.getElementById('card-errors');
      if(event.complete) {
        this.displayError.textContent = "";
      }else if(event.error){
        this.displayError.textContent = event.error.message;
      }

    });
  }


  onSubmit(){
    console.log("Handling the submit button");
    if(this.checkoutFormGroup.invalid){
      this.checkoutFormGroup.markAllAsTouched();
      return;
    }
    // set up order
    let order = new Order();
    order.totalPrice = this.totalPrice;
    order.totalQuantity = this.totalQuantity;
    //  get cart items
    const cartItems = this.cartService.cartItems;
    // create orderItems from cartItems
    let orderItems : OrderItem[] = cartItems.map((cartItem) => new OrderItem(cartItem));
    // setup purchase
    let purchase = new Purchase();

    // populate purchase - customer

    purchase.customer = this.checkoutFormGroup.controls['customer'].value;


    // populate purchase - shipping address
    purchase.shippingAddress = this.checkoutFormGroup.controls['shippingAddress'].value;
    const shippingState: State = JSON.parse(JSON.stringify(purchase.shippingAddress.state));
    const shippingCountry : Country = JSON.parse(JSON.stringify(purchase.shippingAddress.country));
    purchase.shippingAddress.state = shippingState.name;
    purchase.shippingAddress.country = shippingCountry.name

    //populate purchase - billing address

    purchase.billingAddress = this.checkoutFormGroup.controls['billingAddress'].value;
    const billingState: State = JSON.parse(JSON.stringify(purchase.billingAddress.state));
    const billingCountry : Country = JSON.parse(JSON.stringify(purchase.billingAddress.country));
    purchase.billingAddress.state = billingState.name;
    purchase.billingAddress.country = billingCountry.name

    //populate purchase - order and order items

    purchase.order = order;
    purchase.orderItems = orderItems;

    // compute payment info
    this.paymentInfo.amount = Math.round(this.totalPrice*100);
    this.paymentInfo.currency = "USD";
    this.paymentInfo.receiptEmail = purchase.customer.email; 

    console.log(`this.paymentInfo.amount: ${this.paymentInfo.amount}`)

    // if valid form then
    // create payment intent
    // confirm card payment
    // place order

    if (!this.checkoutFormGroup.invalid && this.displayError.textContent === "") {
      this.isDisabled = true;
      this.checkoutService.createPaymentIntent(this.paymentInfo).subscribe(
        (paymentIntentResponse) => {
          this.stripe.confirmCardPayment(
            paymentIntentResponse.client_secret,
            {
              payment_method: {
                card: this.cardElement,
                billing_details: {
                  email : purchase.customer.email,
                  name: `${purchase.customer.firstName} ${purchase.customer.lastName}`,
                  address: {
                    line1: purchase.billingAddress.street,
                    city: purchase.billingAddress.city,
                    state : purchase.billingAddress.state,
                    postal_code : purchase.billingAddress.zipCode,
                    country: this.billingAddressCountry?.value.code
                  }
                }
              }
            },
            { handleActions: false }
          ).then((result: any) => {
            if (result.error) {
              alert(`There was an error: ${result.error.message}`);
              this.isDisabled = false;
            } else {
              // Call REST API via the Checkout Service
              this.checkoutService.placeOrder(purchase).pipe(
                tap((response: any) => {
                  alert(`Your order has been received. \n Order tracking number is: ${response.orderTrackingNumber}`);
                  this.resetCart();
                  this.isDisabled = false;
                }),
                catchError((err: any) => {
                  alert(`There was an error: ${err.message}`);
                  this.isDisabled = false;
                  return err.message;
                })
              ).subscribe();
            }
          });
        }
      );
    }else{
      this.checkoutFormGroup.markAllAsTouched();
      return;
    }
    
    
 

  }

  resetCart() {
    // reset cart data
    this.cartService.cartItems = [];
    this.cartService.totalPrice.next(0);
    this.cartService.totalQuantity.next(0);
    this.cartService.persistCartItems();

    // reset form
    this.checkoutFormGroup.reset();

    // navigate back to the products page
    this.router.navigateByUrl('/products');

  }


  copyShippingAddressToBillingAddress($event: Event) {
    if(($event.target as HTMLInputElement)?.checked){
      this.checkoutFormGroup.controls['billingAddress'].setValue(this.checkoutFormGroup.controls['shippingAddress'].value)
      this.billingStates = this.shippingStates;
    }else{
      this.checkoutFormGroup.controls['billingAddress'].reset();
      this.billingStates = [];
    }
  }


  handleMonthAndYears(){
    const creditCardFormGroup = this.checkoutFormGroup.get('creditCard');

    const currentYear : number = new Date().getFullYear();

    const selectedYear : number = Number(creditCardFormGroup?.value.expirationYear);

    let startMonth : number;

    if(currentYear === selectedYear){
      startMonth = new Date().getMonth() + 1;
    }else{
      startMonth = 1;
    }

    this.luv2ShopService.getCreditCardMonths(startMonth).subscribe(
      data => {
        this.creditCardMonths = data;
      }
    );


  }



  getStates(formGroupName : string){
    const formGroup = this.checkoutFormGroup.get(formGroupName);

    const countryCode = formGroup?.value.country.code;

    this.luv2ShopService.getStates(countryCode).subscribe(
      data => {
        if(formGroupName === 'shippingAddress'){
          this.shippingStates = data;
        }
        if(formGroupName === 'billingAddress'){
          this.billingStates = data;
        }


        formGroup?.get('state')?.setValue(data[0]);
      }
    )

  }


  reviewCartDetails(){
    this.cartService.totalQuantity.subscribe(
      totalQuantity => this.totalQuantity = totalQuantity
    );

    this.cartService.totalPrice.subscribe(
      totalPrice => this.totalPrice = totalPrice
    );
  }


  get firstName(){
    return this.checkoutFormGroup.get('customer.firstName');
  }
  get lastName(){
    return this.checkoutFormGroup.get('customer.lastName');
  }

  get email(){
    return this.checkoutFormGroup.get('customer.email');
  }

  get shippingAddressStreet(){
    return this.checkoutFormGroup.get('shippingAddress.street');
  }

  get shippingAddressCity(){
    return this.checkoutFormGroup.get('shippingAddress.city');
  }

  get shippingAddressState(){
    return this.checkoutFormGroup.get('shippingAddress.state');
  }

  get shippingAddressZipCode(){
    return this.checkoutFormGroup.get('shippingAddress.zipCode');
  }

  get shippingAddressCountry(){
    return this.checkoutFormGroup.get('shippingAddress.country');
  }


  get billingAddressStreet(){
    return this.checkoutFormGroup.get('billingAddress.street');
  }

  get billingAddressCity(){
    return this.checkoutFormGroup.get('billingAddress.city');
  }

  get billingAddressState(){
    return this.checkoutFormGroup.get('billingAddress.state');
  }

  get billingAddressZipCode(){
    return this.checkoutFormGroup.get('billingAddress.zipCode');
  }

  get billingAddressCountry(){
    return this.checkoutFormGroup.get('billingAddress.country');
  }


  get creditCardType() { return this.checkoutFormGroup.get('creditCard.cardType'); }
  get creditCardNameOnCard() { return this.checkoutFormGroup.get('creditCard.nameOnCard');}
  get creditCardNumber() { return this.checkoutFormGroup.get('creditCard.cardNumber'); }
  get creditCardSecurityCode() { return this.checkoutFormGroup.get('creditCard.securityCode');}


  

}
