$('.light-btn').on('click', function () {
    $('body').addClass('dark-theme');
    $('.dark-btn').removeClass('d-none');
    $(this).addClass('d-none');
});

$('.dark-btn').on('click', function () {
    $('body').removeClass('dark-theme');
    $('.light-btn').removeClass('d-none');
    $(this).addClass('d-none');
});
$('.navbar-toggler').on('click', function () {
    $('.nav_links_wrapper').toggleClass('open');
});

$(document).ready(function () {
    let auth = true;
    if (auth) {
        $(".auth_btn_wrapper").addClass("d-none");
        $(".auth_user").removeClass("d-none");
    } else {
        $(".auth_btn_wrapper").removeClass("d-none");
        $(".auth_user").addClass("d-none");
    }

    let timeDate = new Date();
    $("#dataTime").text(timeDate.toLocaleString());


    function cloneElement() {
        const itemData = document.getElementById("item1");
        const most_popular_list_item = document.querySelector("#most_popular_list .list_item");
        const new_arrival_list_item = document.querySelector("#new_arrival_list .list_item");
        const list_view_items = document.querySelector("#list_view_items .list_view_item");

        if (itemData) {
            const clone = itemData.cloneNode(true);
            document.getElementById("itemsWrapper").appendChild(clone);
        }
        if (most_popular_list_item) {
            const most_popular_list_item_clone = most_popular_list_item.cloneNode(true);
            document.getElementById("most_popular_list").appendChild(most_popular_list_item_clone);
        }

        if (new_arrival_list_item) {
            const new_arrival_list_item_clone = new_arrival_list_item.cloneNode(true);
            document.getElementById("new_arrival_list").appendChild(new_arrival_list_item_clone);
        }

        if (list_view_items) {
            const list_view_items_clone = list_view_items.cloneNode(true);
            document.getElementById("list_view_items").appendChild(list_view_items_clone);
        }
    }

    for (i = 1; i < 10; i++) {
        cloneElement()
    }

    const most_popular_list_item = document.querySelector("#chapter_list_container li");
    if (most_popular_list_item) {
        function cloneChapterElement() {

            const clone = most_popular_list_item.cloneNode(true);
            document.getElementById("chapter_list_container").appendChild(clone);
        }

        for (i = 1; i < 20; i++) {
            cloneChapterElement()
        }

    }
    var filter_btn = document.getElementsByClassName("filter_btn");
    var filter_body = document.getElementById("filter_body");

    if (filter_btn.length > 0 && filter_body) {

        filter_btn[0].addEventListener("click", function () {
            if (filter_body.classList.contains("d-none")) {
                document.getElementsByClassName("filter_text")[0].innerHTML = "Hide";
                document.querySelector(".filter_btn .icon i").classList.remove("fa-plus");
                document.querySelector(".filter_btn .icon i").classList.add("fa-minus");
                filter_body.classList.remove("d-none");
            } else {
                filter_body.classList.add("d-none");
                document.querySelector(".filter_btn .icon i").classList.add("fa-plus");
                document.querySelector(".filter_btn .icon i").classList.remove("fa-minus");
                document.getElementsByClassName("filter_text")[0].innerHTML = "Show";
            }
        });
    }

});

function HideGenresInfo() {
    var genre_info = document.getElementById("genre_info");

    if (genre_info.classList.contains("d-none")) {
        genre_info.classList.remove("d-none");
    } else {
        genre_info.classList.add("d-none");
    }
}

let genre_filter_list = document.querySelectorAll(".genres_list_wrapper .list_item");

genre_filter_list.forEach(function (item) {
    item.addEventListener("click", function () {
        if (this.classList.contains("active")) {
            this.classList.remove("active");
            this.classList.add("inactive");
        } else if (this.classList.contains("inactive")) {
            this.classList.remove("inactive");
        } else {
            this.classList.add("active");
        }
    })
})


// Initialize Owl Carousel
$("#hero-slider").owlCarousel({
    loop: true,
    autoPlay: true,
    items: 8,
    margin: 10,
    autoheight: true,
    lazyLoad: true,
    nav: true,
    dots: false,
    navText: [
        "<i class='fas fa-chevron-left'></i>",
        "<i class='fas fa-chevron-right'></i>",
    ],
    autoplayHoverPause: true,
    responsive: {
        0: {
            items: 2,
        },
        763: {
            items: 3,
        },
        992: {
            items: 4,
        },
        1000: {
            items: 8,
        },
    },
});

